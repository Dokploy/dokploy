import { createHash } from "node:crypto";
import type { namecheapDnsConfigSchema } from "@dokploy/server/db/schema";
import { XMLParser } from "fast-xml-parser";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type NamecheapConfig = z.infer<typeof namecheapDnsConfigSchema>;

interface NamecheapHost {
	name: string;
	type: string;
	address: string;
	mxPref?: string;
	ttl?: string;
}

interface StoredHost extends NamecheapHost {
	id: string;
}

type XmlNode = Record<string, unknown>;

const NAMECHEAP_API = "https://api.namecheap.com/xml.response";
const NAMECHEAP_SANDBOX_API = "https://api.sandbox.namecheap.com/xml.response";

const DOMAINS_PAGE_SIZE = 100;
const MIN_TTL = 60;
const MAX_TTL = 60_000;
const DEFAULT_MX_PREFERENCE = "10";

// setHosts only accepts A, AAAA, ALIAS, CAA, CNAME, MX, MXE, NS, TXT, URL,
// URL301 and FRAME records.
const UNSUPPORTED_TYPES = new Set(["SRV", "PTR"]);

const HOSTNAME_TYPES = new Set(["CNAME", "NS", "ALIAS"]);
const CASELESS_TYPES = new Set(["AAAA", "CNAME", "MX", "NS", "ALIAS"]);

const CAA_PATTERN = /^(\d+)\s+(\S+)\s+(?:"([^"]*)"|([^\s"][^"]*))$/;

const LIST_PATHS = new Set([
	"ApiResponse.Errors.Error",
	"ApiResponse.CommandResponse.DomainGetListResult.Domain",
	"ApiResponse.CommandResponse.DomainDNSGetHostsResult.host",
]);

// Every record read here is written back on the next change, so values must
// not be trimmed and every entity, numeric references included, is decoded.
const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	trimValues: false,
	htmlEntities: true,
	parseTagValue: false,
	jPath: true,
	isArray: (_name, jpath, _isLeafNode, isAttribute) =>
		!isAttribute && typeof jpath === "string" && LIST_PATHS.has(jpath),
});

const asNode = (value: unknown): XmlNode | undefined =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as XmlNode)
		: undefined;

const asNodes = (value: unknown): XmlNode[] =>
	Array.isArray(value)
		? value.map(asNode).filter((node): node is XmlNode => !!node)
		: [];

const attr = (node: XmlNode | undefined, name: string) => {
	const value = node?.[`@_${name}`];
	return typeof value === "string" ? value : undefined;
};

const textOf = (value: unknown) => {
	const text = typeof value === "string" ? value : asNode(value)?.["#text"];
	return typeof text === "string" ? text : undefined;
};

const isTrue = (value: string | undefined) => value?.toLowerCase() === "true";

const errorMessages = (api: XmlNode) => {
	const errors = asNode(api.Errors)?.Error;
	return (Array.isArray(errors) ? errors : [])
		.map((error) => {
			const message = textOf(error)?.trim();
			const number = attr(asNode(error), "Number");
			return message && number ? `${message} (${number})` : message;
		})
		.filter((message): message is string => !!message);
};

const ncRequest = async (
	config: NamecheapConfig,
	command: string,
	params: Record<string, string> = {},
): Promise<XmlNode> => {
	const apiUser = config.apiUser.trim();
	const response = await dnsFetch(
		config.sandbox ? NAMECHEAP_SANDBOX_API : NAMECHEAP_API,
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				ApiUser: apiUser,
				ApiKey: config.apiKey.trim(),
				// UserName only differs from ApiUser for a reseller acting on a
				// sub-account.
				UserName: apiUser,
				ClientIp: config.clientIp.trim(),
				Command: command,
				...params,
			}),
		},
	);
	if (!response.ok) {
		throw new Error(`Namecheap: ${command} failed (status ${response.status})`);
	}

	let api: XmlNode | undefined;
	try {
		api = asNode(asNode(parser.parse(await response.text()))?.ApiResponse);
	} catch {
		api = undefined;
	}
	if (!api) {
		throw new Error(`Namecheap: ${command} returned an unexpected response`);
	}

	const errors = errorMessages(api);
	if (attr(api, "Status")?.toUpperCase() !== "OK" || errors.length > 0) {
		throw new Error(
			`Namecheap: ${command} failed: ${
				errors.join(", ") || "the API returned an error status"
			}`,
		);
	}
	return asNode(api.CommandResponse) ?? {};
};

const stripDot = (value: string) => value.replace(/\.$/, "");

const normalizeZone = (zone: string) => stripDot(zone.trim());

// Zones are the registered domains getList returns, so the first label is the
// SLD and the rest the TLD, which also holds for a multi-label TLD like co.uk.
const domainParams = (zone: string) => {
	const normalized = normalizeZone(zone);
	const dot = normalized.indexOf(".");
	const tld = dot > 0 ? normalized.slice(dot + 1) : "";
	if (dot <= 0 || !tld || normalized.includes("..") || /\s/.test(normalized)) {
		throw new Error(`Namecheap: "${zone}" is not a registered domain`);
	}
	return { SLD: normalized.slice(0, dot), TLD: tld };
};

// Host names are relative to the domain, with "@" for the apex, while Dokploy
// works with fully-qualified names.
const toHostName = (name: string, zone: string) => {
	const fqdn = stripDot(name.trim());
	const lowerFqdn = fqdn.toLowerCase();
	const lowerZone = normalizeZone(zone).toLowerCase();
	if (lowerFqdn === lowerZone || fqdn === "@") {
		return "@";
	}
	return lowerFqdn.endsWith(`.${lowerZone}`)
		? fqdn.slice(0, -(lowerZone.length + 1))
		: fqdn;
};

const toFqdn = (name: string, zone: string) => {
	const cleanZone = normalizeZone(zone);
	return name === "@" ? cleanZone : `${name}.${cleanZone}`;
};

const formatCaa = (value: string) => {
	const match = CAA_PATTERN.exec(value.trim());
	if (!match) {
		return undefined;
	}
	const flags = Number(match[1]);
	if (flags > 255) {
		return undefined;
	}
	const tag = (match[2] as string).toLowerCase();
	const target = match[3] ?? (match[4] as string);
	return `${flags} ${tag} "${target}"`;
};

const toContent = (host: NamecheapHost) => {
	if (host.type === "MX") {
		return `${host.mxPref || DEFAULT_MX_PREFERENCE} ${stripDot(host.address)}`;
	}
	if (HOSTNAME_TYPES.has(host.type)) {
		return stripDot(host.address);
	}
	if (host.type === "CAA") {
		return formatCaa(host.address) ?? host.address;
	}
	return host.address;
};

// Namecheap may add or drop the trailing dot of a hostname target, and host
// names and IPv6 addresses are case-insensitive. TXT and CAA values are
// compared exactly.
const recordKey = (host: NamecheapHost) => {
	const content = toContent(host);
	const caseless = CASELESS_TYPES.has(host.type);
	return [
		host.type.toUpperCase(),
		host.name.toLowerCase(),
		caseless ? content.toLowerCase() : content,
	].join("\u0000");
};

const toHost = (
	record: { type: string; name: string; content: string; ttl?: number },
	zone: string,
): NamecheapHost => {
	if (UNSUPPORTED_TYPES.has(record.type)) {
		throw new Error(
			`Namecheap: the API does not support ${record.type} records`,
		);
	}
	if (
		record.ttl !== undefined &&
		(record.ttl < MIN_TTL || record.ttl > MAX_TTL)
	) {
		throw new Error(
			`Namecheap: the TTL must be between ${MIN_TTL} and ${MAX_TTL} seconds, got ${record.ttl}`,
		);
	}

	const value = record.content.trim();
	const host = {
		name: toHostName(record.name, zone),
		type: record.type,
		// Leaving the TTL out lets Namecheap apply its automatic value.
		...(record.ttl === undefined ? {} : { ttl: String(record.ttl) }),
	};

	if (record.type === "MX") {
		const match = /^(\d+)\s+(\S.*)$/.exec(value);
		return match
			? {
					...host,
					mxPref: String(Number(match[1])),
					address: match[2] as string,
				}
			: { ...host, mxPref: DEFAULT_MX_PREFERENCE, address: value };
	}

	if (record.type === "CAA") {
		const formatted = formatCaa(value);
		if (!formatted) {
			throw new Error(
				`Namecheap: a CAA value must be \`flags tag "value"\`, got "${value}"`,
			);
		}
		return { ...host, address: formatted };
	}

	return { ...host, address: value };
};

// Namecheap's setHosts reassigns every HostId in the zone on any write, which
// would break an open edit whenever another record changes. Derive stable ids
// from each record's normalized identity and occurrence index instead.
const assignIds = (hosts: NamecheapHost[]): StoredHost[] => {
	const counts = new Map<string, number>();
	return hosts.map((host) => {
		const key = recordKey(host);
		const occurrence = counts.get(key) ?? 0;
		counts.set(key, occurrence + 1);
		const digest = createHash("sha256").update(key).digest("hex").slice(0, 24);
		return { ...host, id: `${digest}:${occurrence}` };
	});
};

const readZone = async (config: NamecheapConfig, zone: string) => {
	const response = await ncRequest(
		config,
		"namecheap.domains.dns.getHosts",
		domainParams(zone),
	);
	const result = asNode(response.DomainDNSGetHostsResult);
	// Every change writes back the records read here, so a response without a
	// record set must never be mistaken for an empty zone.
	if (!result) {
		throw new Error(`Namecheap: getHosts returned no records for ${zone}`);
	}
	if (attr(result, "IsUsingOurDNS")?.toLowerCase() === "false") {
		throw new Error(
			`Namecheap: ${zone} does not use Namecheap's DNS servers, so its records cannot be managed through the API`,
		);
	}

	return {
		mailSetting: attr(result, "EmailType") ?? "",
		hosts: assignIds(
			asNodes(result.host).map(
				(host): NamecheapHost => ({
					name: attr(host, "Name") || "@",
					type: (attr(host, "Type") ?? "").toUpperCase(),
					address: attr(host, "Address") ?? "",
					mxPref: attr(host, "MXPref"),
					ttl: attr(host, "TTL"),
				}),
			),
		),
	};
};

// Namecheap keeps MX records only while a domain's mail setting is MX (Custom
// MX) and silently drops them under any other. Switching to MX replaces the
// mail routing of Namecheap's presets (email forwarding, Private Email, Gmail),
// so a domain is only moved to MX from having no mail setting, and only by a
// change that writes an MX record itself.
const mailSettingFor = (
	zone: string,
	current: string,
	hosts: NamecheapHost[],
	writesMx: boolean,
) => {
	if (!hosts.some((host) => host.type === "MX")) {
		return undefined;
	}
	const setting = current.toUpperCase();
	if (
		setting === "MX" ||
		(writesMx && (setting === "" || setting === "NONE"))
	) {
		return "MX";
	}
	throw new Error(
		`Namecheap: ${zone} uses the "${current || "NONE"}" mail setting, under which Namecheap drops MX records. Set the domain's Mail Settings to Custom MX in Namecheap, then try again.`,
	);
};

const writeZone = async (
	config: NamecheapConfig,
	zone: string,
	hosts: NamecheapHost[],
	mailSetting: string | undefined,
) => {
	const params: Record<string, string> = { ...domainParams(zone) };
	// Omitting EmailType keeps the domain's current mail setting.
	if (mailSetting) {
		params.EmailType = mailSetting;
	}
	hosts.forEach((host, index) => {
		const n = index + 1;
		params[`HostName${n}`] = host.name;
		params[`RecordType${n}`] = host.type;
		params[`Address${n}`] = host.address;
		if (host.type === "MX") {
			params[`MXPref${n}`] = host.mxPref || DEFAULT_MX_PREFERENCE;
		}
		if (host.ttl) {
			params[`TTL${n}`] = host.ttl;
		}
	});

	const response = await ncRequest(
		config,
		"namecheap.domains.dns.setHosts",
		params,
	);
	// A rejected write still answers Status="OK"; IsSuccess is the only signal.
	if (!isTrue(attr(asNode(response.DomainDNSSetHostsResult), "IsSuccess"))) {
		throw new Error(`Namecheap: the changes to ${zone} were not applied`);
	}
};

const zoneWrites = new Map<string, Promise<void>>();

// setHosts replaces a domain's whole record set, so two changes built from the
// same read would undo each other. Changes made by this process are queued per
// domain; the API offers no way to detect an edit made elsewhere meanwhile.
const queueZoneWrite = <T>(
	config: NamecheapConfig,
	zone: string,
	write: () => Promise<T>,
): Promise<T> => {
	const key = `${config.sandbox ? "sandbox" : "production"}:${config.apiUser.trim().toLowerCase()}:${normalizeZone(zone).toLowerCase()}`;
	const result = (zoneWrites.get(key) ?? Promise.resolve()).then(write);
	const settled = result.then(
		() => undefined,
		() => undefined,
	);
	zoneWrites.set(key, settled);
	void settled.then(() => {
		if (zoneWrites.get(key) === settled) {
			zoneWrites.delete(key);
		}
	});
	return result;
};

const changeZone = async (
	config: NamecheapConfig,
	zone: string,
	change: (hosts: StoredHost[]) => NamecheapHost[],
	writesMx: boolean,
) => {
	const current = await readZone(config, zone);
	const hosts = change(current.hosts);
	await writeZone(
		config,
		zone,
		hosts,
		mailSettingFor(zone, current.mailSetting, hosts, writesMx),
	);
	return assignIds(hosts);
};

// Re-read the zone after setHosts to verify the written record persisted and
// return its stable id.
const findWritten = async (
	config: NamecheapConfig,
	zone: string,
	written: NamecheapHost,
	expectedId: string,
) => {
	const key = recordKey(written);
	const hosts = (await readZone(config, zone)).hosts;
	const match =
		hosts.find((host) => host.id === expectedId) ??
		hosts.find((host) => recordKey(host) === key);
	if (!match) {
		throw new Error(
			`Namecheap: ${zone} was updated, but the ${written.type} record for ${toFqdn(written.name, zone)} was not found when reading it back. Refresh the records to check the domain.`,
		);
	}
	return { id: match.id };
};

const replaceHost = (
	hosts: StoredHost[],
	recordId: string,
	zone: string,
	replacement: NamecheapHost[],
) => {
	const index = hosts.findIndex((host) => host.id === recordId);
	if (index === -1) {
		throw new Error(
			`Namecheap: record ${recordId} no longer exists in ${zone}. Refresh the records and try again.`,
		);
	}
	return {
		index,
		hosts: [
			...hosts.slice(0, index),
			...replacement,
			...hosts.slice(index + 1),
		],
	};
};

export const namecheapClient: DnsClient<NamecheapConfig> = {
	async listZones(config) {
		const zones: { id: string; name: string }[] = [];
		let fetched = 0;
		for (let page = 1; ; page += 1) {
			const response = await ncRequest(config, "namecheap.domains.getList", {
				ListType: "ALL",
				Page: String(page),
				PageSize: String(DOMAINS_PAGE_SIZE),
			});
			const domains = asNodes(asNode(response.DomainGetListResult)?.Domain);
			fetched += domains.length;
			for (const domain of domains) {
				const name = attr(domain, "Name");
				// Only domains on Namecheap's DNS servers have records the API manages.
				if (name && isTrue(attr(domain, "IsOurDNS"))) {
					zones.push({ id: name, name });
				}
			}

			const rawTotal = textOf(asNode(response.Paging)?.TotalItems)?.trim();
			const total = rawTotal ? Number(rawTotal) : Number.NaN;
			const lastPage = Number.isFinite(total)
				? fetched >= total
				: domains.length < DOMAINS_PAGE_SIZE;
			if (lastPage || domains.length === 0) {
				return zones;
			}
		}
	},

	async listRecords(config, zoneId) {
		const { hosts } = await readZone(config, zoneId);
		return hosts.map((host) => {
			const ttl = Number(host.ttl);
			return {
				id: host.id,
				type: host.type,
				name: toFqdn(host.name, zoneId),
				content: toContent(host),
				ttl: Number.isFinite(ttl) ? ttl : 0,
			};
		});
	},

	async upsertRecord(config, record) {
		const written = toHost(record, record.zoneId);
		const key = recordKey(written);
		return await queueZoneWrite(config, record.zoneId, async () => {
			let writtenIndex = -1;
			const nextHosts = await changeZone(
				config,
				record.zoneId,
				(hosts) => {
					const index = hosts.findIndex((host) => recordKey(host) === key);
					if (index === -1) {
						writtenIndex = hosts.length;
						return [...hosts, written];
					}
					writtenIndex = index;
					return hosts.map((host, i) => (i === index ? written : host));
				},
				written.type === "MX",
			);
			const expectedId = (nextHosts[writtenIndex] as StoredHost).id;
			return await findWritten(config, record.zoneId, written, expectedId);
		});
	},

	async updateRecord(config, zoneId, recordId, record) {
		const written = toHost(record, zoneId);
		return await queueZoneWrite(config, zoneId, async () => {
			let writtenIndex = -1;
			const nextHosts = await changeZone(
				config,
				zoneId,
				(hosts) => {
					const replaced = replaceHost(hosts, recordId, zoneId, [written]);
					writtenIndex = replaced.index;
					return replaced.hosts;
				},
				written.type === "MX",
			);
			const expectedId = (nextHosts[writtenIndex] as StoredHost).id;
			return await findWritten(config, zoneId, written, expectedId);
		});
	},

	async deleteRecord(config, zoneId, recordId) {
		await queueZoneWrite(config, zoneId, async () => {
			await changeZone(
				config,
				zoneId,
				(hosts) => replaceHost(hosts, recordId, zoneId, []).hosts,
				false,
			);
		});
	},

	async testConnection(config) {
		await ncRequest(config, "namecheap.domains.getList", { PageSize: "10" });
	},
};
