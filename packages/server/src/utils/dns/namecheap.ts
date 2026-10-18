import type {
	DnsRecordType,
	namecheapDnsConfigSchema,
} from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type NamecheapConfig = z.infer<typeof namecheapDnsConfigSchema>;

const NAMECHEAP_API = "https://api.namecheap.com/xml.response";
const DOMAINS_PAGE_SIZE = 100;
const DEFAULT_TTL = 1800;
const DEFAULT_MX_PREF = "10";

const SUPPORTED_TYPES: readonly DnsRecordType[] = [
	"A",
	"AAAA",
	"CNAME",
	"MX",
	"TXT",
	"NS",
	"CAA",
];
const EMAIL_TYPES = ["MXE", "MX", "FWD", "OX"];

interface NamecheapHost {
	name: string;
	type: string;
	address: string;
	mxPref: string;
	ttl: string;
}

const XML_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

const decodeXml = (value: string) =>
	value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity: string) => {
		if (entity.startsWith("#")) {
			const code = /^#x/i.test(entity)
				? Number.parseInt(entity.slice(2), 16)
				: Number.parseInt(entity.slice(1), 10);
			return Number.isNaN(code) ? match : String.fromCodePoint(code);
		}
		return XML_ENTITIES[entity.toLowerCase()] ?? match;
	});

// The responses are flat elements whose data sits in attributes, so a small
// matcher is enough and avoids pulling in an XML parser.
const findElements = (xml: string, tag: string) =>
	[...xml.matchAll(new RegExp(`<${tag}\\b((?:[^>"]|"[^"]*")*)>`, "gi"))].map(
		(match) => {
			const attributes: Record<string, string> = {};
			for (const [, key, value] of (match[1] ?? "").matchAll(
				/([\w:]+)="([^"]*)"/g,
			)) {
				attributes[key as string] = decodeXml(value as string);
			}
			return attributes;
		},
	);

const ncFetch = async (
	config: NamecheapConfig,
	command: string,
	params: Record<string, string> = {},
) => {
	const response = await dnsFetch(NAMECHEAP_API, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			ApiUser: config.apiUser,
			ApiKey: config.apiKey,
			UserName: config.apiUser,
			ClientIp: config.clientIp,
			Command: command,
			...params,
		}).toString(),
	});

	const xml = await response.text();
	const status = findElements(xml, "ApiResponse")[0]?.Status;
	if (!response.ok || status !== "OK") {
		const errors = [
			...xml.matchAll(
				/<Error\b[^>]*?Number="(\d+)"[^>]*>([\s\S]*?)<\/Error>/gi,
			),
		].map(
			([, number, message]) =>
				`${decodeXml((message ?? "").trim())} [${number}]`,
		);
		throw new Error(
			`Namecheap: ${command} failed${
				errors.length
					? `: ${errors.join(", ")}`
					: ` (status ${response.status})`
			}`,
		);
	}
	return xml;
};

// Namecheap addresses a domain as SLD + TLD, where the TLD can hold several
// labels (example.co.uk is "example" + "co.uk").
const splitDomain = (domain: string) => {
	const index = domain.indexOf(".");
	if (index <= 0) {
		throw new Error(`Namecheap: invalid domain "${domain}"`);
	}
	return { SLD: domain.slice(0, index), TLD: domain.slice(index + 1) };
};

const stripTrailingDot = (value: string) => value.replace(/\.$/, "");

const toRelativeName = (name: string, domain: string) => {
	const fqdn = stripTrailingDot(name);
	if (fqdn === domain) {
		return "@";
	}
	const suffix = `.${domain}`;
	return fqdn.endsWith(suffix) ? fqdn.slice(0, -suffix.length) : fqdn;
};

const toFqdn = (name: string, domain: string) =>
	name === "@" ? domain : `${name}.${domain}`;

// Namecheap returns hostnames in CNAME, MX and NS values with a trailing dot
// that users do not usually type, so values are compared without it.
const hostKey = (host: NamecheapHost) =>
	JSON.stringify([
		host.type,
		host.name.toLowerCase(),
		["CNAME", "MX", "NS"].includes(host.type)
			? stripTrailingDot(host.address).toLowerCase()
			: host.address,
		host.type === "MX" ? host.mxPref : "",
	]);

// setHosts recreates every record and Namecheap's HostId does not survive
// that, so the id is derived from the record's own values instead.
const encodeRecordId = (host: NamecheapHost) =>
	Buffer.from(hostKey(host)).toString("base64url");

const decodeRecordId = (id: string) =>
	Buffer.from(id, "base64url").toString("utf8");

const getHosts = async (config: NamecheapConfig, domain: string) => {
	const xml = await ncFetch(
		config,
		"namecheap.domains.dns.getHosts",
		splitDomain(domain),
	);
	const hosts: NamecheapHost[] = findElements(xml, "host").map((host) => ({
		name: host.Name ?? "",
		type: host.Type ?? "",
		address: host.Address ?? "",
		mxPref: host.MXPref ?? DEFAULT_MX_PREF,
		ttl: host.TTL ?? String(DEFAULT_TTL),
	}));
	const emailType = findElements(xml, "DomainDNSGetHostsResult")[0]?.EmailType;
	return { hosts, emailType };
};

const setHosts = async (
	config: NamecheapConfig,
	domain: string,
	hosts: NamecheapHost[],
	emailType: string | undefined,
) => {
	const params: Record<string, string> = splitDomain(domain);
	hosts.forEach((host, index) => {
		const n = index + 1;
		params[`HostName${n}`] = host.name;
		params[`RecordType${n}`] = host.type;
		params[`Address${n}`] = host.address;
		params[`MXPref${n}`] = host.mxPref;
		params[`TTL${n}`] = host.ttl;
	});
	// Leaving EmailType out resets the domain's mail settings, so the current
	// value is sent back unchanged.
	if (emailType && EMAIL_TYPES.includes(emailType)) {
		params.EmailType = emailType;
	}

	const xml = await ncFetch(config, "namecheap.domains.dns.setHosts", params);
	const result = findElements(xml, "DomainDNSSetHostsResult")[0];
	if (result?.IsSuccess?.toLowerCase() !== "true") {
		throw new Error(`Namecheap: could not save the records of ${domain}`);
	}
};

const buildHost = (
	record: {
		type: DnsRecordType;
		name: string;
		content: string;
		ttl?: number;
	},
	domain: string,
): NamecheapHost => {
	if (!SUPPORTED_TYPES.includes(record.type)) {
		throw new Error(
			`Namecheap: ${record.type} records are not supported by the Namecheap API`,
		);
	}
	const content = record.content.trim();
	const host = {
		name: toRelativeName(record.name, domain),
		type: record.type,
		address: content,
		mxPref: DEFAULT_MX_PREF,
		ttl: String(record.ttl ?? DEFAULT_TTL),
	};
	if (record.type === "MX") {
		const match = /^(\d+)\s+(\S+)$/.exec(content);
		if (match) {
			host.mxPref = match[1] as string;
			host.address = match[2] as string;
		}
	}
	return host;
};

// Custom MX records only take effect when the domain's mail mode is "MX".
const nextEmailType = (type: string, current: string | undefined) =>
	type === "MX" ? "MX" : current;

export const namecheapClient: DnsClient<NamecheapConfig> = {
	async listZones(config) {
		const zones: { id: string; name: string }[] = [];
		let page = 1;
		let total = 0;
		let fetched = 0;
		do {
			const xml = await ncFetch(config, "namecheap.domains.getList", {
				PageSize: String(DOMAINS_PAGE_SIZE),
				Page: String(page),
			});
			const domains = findElements(xml, "Domain");
			// Domains on other nameservers have no records Namecheap can manage.
			for (const domain of domains) {
				if (domain.Name && domain.IsOurDNS?.toLowerCase() !== "false") {
					zones.push({ id: domain.Name, name: domain.Name });
				}
			}
			fetched += domains.length;
			total = Number(/<TotalItems>(\d+)<\/TotalItems>/i.exec(xml)?.[1] ?? 0);
			page += 1;
			if (domains.length === 0) {
				break;
			}
		} while (fetched < total);
		return zones;
	},

	async listRecords(config, zoneId) {
		const { hosts } = await getHosts(config, zoneId);
		return hosts.map((host) => ({
			id: encodeRecordId(host),
			type: host.type,
			name: toFqdn(host.name, zoneId),
			content:
				host.type === "MX" ? `${host.mxPref} ${host.address}` : host.address,
			ttl: Number(host.ttl),
		}));
	},

	async upsertRecord(config, record) {
		const built = buildHost(record, record.zoneId);
		const { hosts, emailType } = await getHosts(config, record.zoneId);
		const index = hosts.findIndex((host) => hostKey(host) === hostKey(built));
		if (index === -1) {
			hosts.push(built);
		} else {
			hosts[index] = built;
		}
		await setHosts(
			config,
			record.zoneId,
			hosts,
			nextEmailType(record.type, emailType),
		);
		return { id: encodeRecordId(built) };
	},

	async updateRecord(config, zoneId, recordId, record) {
		const built = buildHost(record, zoneId);
		const { hosts, emailType } = await getHosts(config, zoneId);
		const key = decodeRecordId(recordId);
		const index = hosts.findIndex((host) => hostKey(host) === key);
		if (index === -1) {
			throw new Error("Namecheap: record not found, it may have changed");
		}
		hosts[index] = built;
		await setHosts(
			config,
			zoneId,
			hosts,
			nextEmailType(record.type, emailType),
		);
		return { id: encodeRecordId(built) };
	},

	async deleteRecord(config, zoneId, recordId) {
		const { hosts, emailType } = await getHosts(config, zoneId);
		const key = decodeRecordId(recordId);
		const remaining = hosts.filter((host) => hostKey(host) !== key);
		if (remaining.length === hosts.length) {
			throw new Error("Namecheap: record not found, it may have changed");
		}
		await setHosts(config, zoneId, remaining, emailType);
	},

	async testConnection(config) {
		await ncFetch(config, "namecheap.domains.getList", {
			PageSize: "10",
			Page: "1",
		});
	},
};
