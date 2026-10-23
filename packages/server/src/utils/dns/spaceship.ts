import type {
	DnsRecordType,
	spaceshipDnsConfigSchema,
} from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type SpaceshipConfig = z.infer<typeof spaceshipDnsConfigSchema>;

const SPACESHIP_API = "https://spaceship.dev/api/v1";
const DOMAINS_PAGE_SIZE = 100;
const RECORDS_PAGE_SIZE = 500;
const DEFAULT_TTL = 3600;

interface SpaceshipError {
	detail?: string;
	data?: { field: string; details: string }[];
}

interface SpaceshipPage<T> {
	items: T[];
	total: number;
}

// Spaceship spreads a record's value over type-specific fields (address,
// cname, exchange + preference, ...) and gives records no id.
type SpaceshipRecord = {
	type: string;
	name: string;
	ttl?: number;
	group?: { type: string };
} & Record<string, unknown>;

const ssFetch = async <T>(
	config: SpaceshipConfig,
	path: string,
	init: { method?: string; body?: unknown } = {},
): Promise<T> => {
	const response = await dnsFetch(`${SPACESHIP_API}${path}`, {
		method: init.method ?? "GET",
		headers: {
			"X-API-Key": config.apiKey,
			"X-API-Secret": config.apiSecret,
			...(init.body !== undefined && { "Content-Type": "application/json" }),
		},
		...(init.body !== undefined && { body: JSON.stringify(init.body) }),
	});

	if (!response.ok) {
		const error = (await response
			.json()
			.catch(() => null)) as SpaceshipError | null;
		const message = [
			error?.detail,
			error?.data?.map((item) => `${item.field}: ${item.details}`).join(", "),
		]
			.filter(Boolean)
			.join(" - ");
		throw new Error(
			`Spaceship: request to ${path} failed${
				message ? `: ${message}` : ` (status ${response.status})`
			}`,
		);
	}

	if (response.status === 204) {
		return undefined as T;
	}
	return (await response.json()) as T;
};

const fetchAllPages = async <T>(
	config: SpaceshipConfig,
	path: string,
	pageSize: number,
) => {
	const items: T[] = [];
	let total = 0;
	do {
		const page = await ssFetch<SpaceshipPage<T>>(
			config,
			`${path}?take=${pageSize}&skip=${items.length}`,
		);
		items.push(...page.items);
		total = page.total;
		if (page.items.length === 0) {
			break;
		}
	} while (items.length < total);
	return items;
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

const unquote = (value: string) =>
	/^".*"$/.test(value) ? value.slice(1, -1) : value;

const recordName = (record: SpaceshipRecord, domain: string) => {
	const name = toFqdn(record.name, domain);
	return record.type === "SRV"
		? `${record.service}.${record.protocol}.${name}`
		: name;
};

const recordContent = (record: SpaceshipRecord) => {
	switch (record.type) {
		case "A":
		case "AAAA":
			return String(record.address);
		case "CNAME":
			return String(record.cname);
		case "NS":
			return String(record.nameserver);
		case "PTR":
			return String(record.pointer);
		case "TXT":
			return String(record.value);
		case "ALIAS":
			return String(record.aliasName);
		case "MX":
			return `${record.preference} ${record.exchange}`;
		case "SRV":
			return `${record.priority} ${record.weight} ${record.port} ${record.target}`;
		case "CAA":
			return `${record.flag} ${record.tag} "${record.value}"`;
		default:
			return Object.entries(record)
				.filter(([key]) => !["type", "name", "ttl", "group"].includes(key))
				.map(([, value]) => String(value))
				.join(" ");
	}
};

const parseContent = (
	type: DnsRecordType,
	content: string,
	pattern: RegExp,
	expected: string,
) => {
	const match = pattern.exec(content);
	if (!match) {
		throw new Error(`Spaceship: ${type} content must be "${expected}"`);
	}
	return match.slice(1) as string[];
};

const buildRecord = (
	record: {
		type: DnsRecordType;
		name: string;
		content: string;
		ttl?: number;
	},
	domain: string,
): SpaceshipRecord => {
	const name = toRelativeName(record.name, domain);
	const content = record.content.trim();
	const base = { type: record.type, name, ttl: record.ttl ?? DEFAULT_TTL };

	switch (record.type) {
		case "A":
		case "AAAA":
			return { ...base, address: content };
		case "CNAME":
			return { ...base, cname: stripTrailingDot(content) };
		case "NS":
			return { ...base, nameserver: stripTrailingDot(content) };
		case "PTR":
			return { ...base, pointer: stripTrailingDot(content) };
		case "TXT":
			return { ...base, value: content };
		case "MX": {
			const [preference, exchange] = parseContent(
				record.type,
				content,
				/^(\d+)\s+(\S+)$/,
				"<priority> <mail server>",
			);
			return {
				...base,
				preference: Number(preference),
				exchange: stripTrailingDot(exchange as string),
			};
		}
		case "SRV": {
			// The service and protocol labels are separate fields on Spaceship,
			// so "_sip._tcp.app" is stored as name "app" plus "_sip" and "_tcp".
			const [service, protocol, host] = parseContent(
				record.type,
				name,
				/^(_[^.]+)\.(_[^.]+)(?:\.(.+))?$/,
				"_service._protocol.name",
			);
			const [priority, weight, port, target] = parseContent(
				record.type,
				content,
				/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)$/,
				"<priority> <weight> <port> <target>",
			);
			return {
				...base,
				name: host ?? "@",
				service,
				protocol,
				priority: Number(priority),
				weight: Number(weight),
				port: Number(port),
				target: stripTrailingDot(target as string),
			};
		}
		case "CAA": {
			const [flag, tag, value] = parseContent(
				record.type,
				content,
				/^(\d+)\s+(\S+)\s+(.+)$/,
				'<flags> <tag> "<value>"',
			);
			return {
				...base,
				flag: Number(flag),
				tag,
				value: unquote(value as string),
			};
		}
	}
};

const withoutKeys = (record: SpaceshipRecord, keys: string[]) =>
	Object.fromEntries(
		Object.entries(record)
			.filter(([key]) => !keys.includes(key))
			.sort(([a], [b]) => a.localeCompare(b)),
	) as SpaceshipRecord;

// Records have no id on Spaceship and are matched by their full value, so the
// id carries the record itself, which is what the delete endpoint expects.
const encodeRecordId = (record: SpaceshipRecord) =>
	Buffer.from(JSON.stringify(withoutKeys(record, ["group"]))).toString(
		"base64url",
	);

const decodeRecordId = (id: string): SpaceshipRecord => {
	try {
		const record = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
		if (typeof record?.type === "string" && typeof record?.name === "string") {
			return record as SpaceshipRecord;
		}
	} catch {}
	throw new Error(`Spaceship: invalid record id "${id}"`);
};

const sameRecord = (a: SpaceshipRecord, b: SpaceshipRecord) =>
	JSON.stringify(withoutKeys(a, ["ttl", "group"])) ===
	JSON.stringify(withoutKeys(b, ["ttl", "group"]));

const saveRecord = (
	config: SpaceshipConfig,
	domain: string,
	record: SpaceshipRecord,
) =>
	ssFetch(config, `/dns/records/${encodeURIComponent(domain)}`, {
		method: "PUT",
		body: { items: [record] },
	});

const removeRecord = (
	config: SpaceshipConfig,
	domain: string,
	record: SpaceshipRecord,
) =>
	ssFetch(config, `/dns/records/${encodeURIComponent(domain)}`, {
		method: "DELETE",
		body: [withoutKeys(record, ["ttl", "group"])],
	});

export const spaceshipClient: DnsClient<SpaceshipConfig> = {
	async listZones(config) {
		const domains = await fetchAllPages<{ name: string }>(
			config,
			"/domains",
			DOMAINS_PAGE_SIZE,
		);
		return domains.map((domain) => ({ id: domain.name, name: domain.name }));
	},

	async listRecords(config, zoneId) {
		const records = await fetchAllPages<SpaceshipRecord>(
			config,
			`/dns/records/${encodeURIComponent(zoneId)}`,
			RECORDS_PAGE_SIZE,
		);
		return records.map((record) => ({
			id: encodeRecordId(record),
			type: record.type,
			name: recordName(record, zoneId),
			content: recordContent(record),
			ttl: record.ttl ?? DEFAULT_TTL,
		}));
	},

	async upsertRecord(config, record) {
		// Saving a record whose value already exists only updates its TTL.
		const built = buildRecord(record, record.zoneId);
		await saveRecord(config, record.zoneId, built);
		return { id: encodeRecordId(built) };
	},

	async updateRecord(config, zoneId, recordId, record) {
		const existing = decodeRecordId(recordId);
		const built = buildRecord(record, zoneId);

		if (sameRecord(existing, built)) {
			await saveRecord(config, zoneId, built);
			return { id: encodeRecordId(built) };
		}

		// Delete first: Spaceship rejects a CNAME that would sit alongside other
		// data on the same name. If saving then fails, put the original back.
		await removeRecord(config, zoneId, existing);
		try {
			await saveRecord(config, zoneId, built);
		} catch (error) {
			await saveRecord(config, zoneId, existing).catch(() => {
				throw new Error(
					`${error instanceof Error ? error.message : String(error)}. The original record was deleted and could not be restored.`,
				);
			});
			throw error;
		}
		return { id: encodeRecordId(built) };
	},

	async deleteRecord(config, zoneId, recordId) {
		await removeRecord(config, zoneId, decodeRecordId(recordId));
	},

	async testConnection(config) {
		await ssFetch(config, "/domains?take=1&skip=0");
	},
};
