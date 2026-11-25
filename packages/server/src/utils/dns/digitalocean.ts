import type { digitaloceanDnsConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type DigitalOceanConfig = z.infer<typeof digitaloceanDnsConfigSchema>;

interface DigitalOceanRecord {
	id: number;
	type: string;
	name: string;
	data: string;
	priority: number | null;
	port: number | null;
	ttl: number;
	weight: number | null;
	flags: number | null;
	tag: string | null;
}

type RecordData = Pick<DigitalOceanRecord, "type" | "data"> &
	Partial<
		Pick<DigitalOceanRecord, "priority" | "port" | "weight" | "flags" | "tag">
	>;

interface DigitalOceanPage {
	links?: { pages?: { next?: string } };
}

const DIGITALOCEAN_API = "https://api.digitalocean.com/v2";

const PER_PAGE = 200;

const doFetch = async <T>(
	config: DigitalOceanConfig,
	path: string,
	init: RequestInit = {},
): Promise<T> => {
	const response = await dnsFetch(`${DIGITALOCEAN_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${config.apiToken.trim()}`,
			"Content-Type": "application/json",
			...init.headers,
		},
	});

	// A successful DELETE answers 204 with an empty body.
	const text = await response.text();
	let body: unknown;
	try {
		body = text ? JSON.parse(text) : undefined;
	} catch {
		body = undefined;
	}

	if (!response.ok) {
		const detail =
			body && typeof body === "object" && "message" in body
				? String(body.message)
				: undefined;
		throw new Error(
			`DigitalOcean: request to ${path} failed${
				detail ? `: ${detail}` : ` (status ${response.status})`
			}`,
		);
	}
	return body as T;
};

const listAll = async <T>(
	config: DigitalOceanConfig,
	path: string,
	key: "domains" | "domain_records",
): Promise<T[]> => {
	const items: T[] = [];
	const separator = path.includes("?") ? "&" : "?";
	for (let page = 1; ; page += 1) {
		const body = await doFetch<
			DigitalOceanPage & Partial<Record<typeof key, T[]>>
		>(config, `${path}${separator}per_page=${PER_PAGE}&page=${page}`);
		items.push(...(body[key] ?? []));
		if (!body.links?.pages?.next) {
			return items;
		}
	}
};

// Record names are relative to the zone, with "@" for the apex, while Dokploy
// works with fully-qualified names.
const toRelativeName = (name: string, zone: string) => {
	const fqdn = name.trim().replace(/\.$/, "");
	if (fqdn === zone || fqdn === "@") {
		return "@";
	}
	const suffix = `.${zone}`;
	return fqdn.endsWith(suffix) ? fqdn.slice(0, -suffix.length) : fqdn;
};

const toFqdn = (name: string, zone: string) =>
	name === "@" ? zone : `${name}.${zone}`;

// Hostname data without a trailing dot is taken as relative to the zone, so
// "mail.example.com" would be stored as "mail.example.com.example.com".
// Responses drop that dot again and use "@" for the apex.
const toAbsoluteHost = (host: string) =>
	host === "@" || host.endsWith(".") ? host : `${host}.`;

const fromAbsoluteHost = (host: string, zone: string) =>
	host === "@" ? zone : host.replace(/\.$/, "");

const HOSTNAME_TYPES = new Set(["CNAME", "MX", "NS", "SRV"]);

// A CAA iodef value is a URL or mailto: URI rather than a CA's domain.
const holdsHostname = (record: RecordData) =>
	HOSTNAME_TYPES.has(record.type) ||
	(record.type === "CAA" && record.tag !== "iodef");

const parseContent = (record: { type: string; content: string }) => {
	const value = record.content.trim();
	const { type } = record;

	if (type === "MX") {
		const match = /^(\d+)\s+(\S.*)$/.exec(value);
		return match
			? { type, priority: Number(match[1]), data: match[2] as string }
			: { type, priority: 10, data: value };
	}

	if (type === "SRV") {
		const parts = value.split(/\s+/);
		const [priority, weight, port, target] = parts;
		if (parts.length !== 4 || !target) {
			throw new Error(
				`DigitalOcean: an SRV value must be "priority weight port target", got "${value}"`,
			);
		}
		return {
			type,
			priority: Number(priority),
			weight: Number(weight),
			port: Number(port),
			data: target,
		};
	}

	if (type === "CAA") {
		const match = /^(\d+)\s+(\S+)\s+"?([^"]+)"?$/.exec(value);
		if (!match) {
			throw new Error(
				`DigitalOcean: a CAA value must be \`flags tag "value"\`, got "${value}"`,
			);
		}
		return {
			type,
			flags: Number(match[1]),
			tag: match[2] as string,
			data: match[3] as string,
		};
	}

	return { type, data: value };
};

const toContent = (record: RecordData, zone: string) => {
	const data = holdsHostname(record)
		? fromAbsoluteHost(record.data, zone)
		: record.data;
	switch (record.type) {
		case "MX":
			return `${record.priority} ${data}`;
		case "SRV":
			return `${record.priority} ${record.weight} ${record.port} ${data}`;
		case "CAA":
			return `${record.flags} ${record.tag} "${data}"`;
		default:
			return data;
	}
};

const recordPayload = (
	record: { type: string; name: string; content: string; ttl?: number },
	zone: string,
) => {
	const parsed: RecordData = parseContent(record);
	return {
		...parsed,
		data: holdsHostname(parsed) ? toAbsoluteHost(parsed.data) : parsed.data,
		name: toRelativeName(record.name, zone),
		// Leaving the ttl out lets DigitalOcean apply its default.
		...(record.ttl === undefined ? {} : { ttl: record.ttl }),
	};
};

const recordsPath = (zoneId: string) =>
	`/domains/${encodeURIComponent(zoneId)}/records`;

const recordPath = (zoneId: string, recordId: string) =>
	`${recordsPath(zoneId)}/${encodeURIComponent(recordId)}`;

const createRecord = async (
	config: DigitalOceanConfig,
	zoneId: string,
	payload: ReturnType<typeof recordPayload>,
) => {
	const { domain_record } = await doFetch<{
		domain_record: DigitalOceanRecord;
	}>(config, recordsPath(zoneId), {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return { id: String(domain_record.id) };
};

// Used to undo the delete half of a type change when the replacement fails.
const restoreRecord = async (
	config: DigitalOceanConfig,
	zoneId: string,
	original: DigitalOceanRecord,
	cause: unknown,
) => {
	const name = toFqdn(original.name, zoneId);
	const content = toContent(original, zoneId);
	try {
		await createRecord(
			config,
			zoneId,
			recordPayload(
				{ type: original.type, name, content, ttl: original.ttl },
				zoneId,
			),
		);
	} catch {
		throw new Error(
			`DigitalOcean: could not replace the record and could not restore the original one, which has been deleted. Recreate it manually: ${original.type} ${name} -> ${content}. Original failure: ${
				cause instanceof Error ? cause.message : String(cause)
			}`,
		);
	}
};

export const digitaloceanClient: DnsClient<DigitalOceanConfig> = {
	async listZones(config) {
		const domains = await listAll<{ name: string }>(
			config,
			"/domains",
			"domains",
		);
		return domains.map((domain) => ({ id: domain.name, name: domain.name }));
	},

	async listRecords(config, zoneId) {
		const records = await listAll<DigitalOceanRecord>(
			config,
			recordsPath(zoneId),
			"domain_records",
		);
		return records.map((record) => ({
			id: String(record.id),
			type: record.type,
			name: toFqdn(record.name, zoneId),
			content: toContent(record, zoneId),
			ttl: record.ttl,
		}));
	},

	async upsertRecord(config, record) {
		const payload = recordPayload(record, record.zoneId);
		const query = new URLSearchParams({
			type: record.type,
			name: toFqdn(payload.name, record.zoneId),
		});
		const candidates = await listAll<DigitalOceanRecord>(
			config,
			`${recordsPath(record.zoneId)}?${query}`,
			"domain_records",
		);

		const expected = toContent(payload, record.zoneId);
		const existing = candidates.find(
			(candidate) => toContent(candidate, record.zoneId) === expected,
		);
		if (existing) {
			await doFetch(config, recordPath(record.zoneId, String(existing.id)), {
				method: "PUT",
				body: JSON.stringify(payload),
			});
			return { id: String(existing.id) };
		}

		return await createRecord(config, record.zoneId, payload);
	},

	async updateRecord(config, zoneId, recordId, record) {
		const payload = recordPayload(record, zoneId);
		const path = recordPath(zoneId, recordId);
		const { domain_record: existing } = await doFetch<{
			domain_record: DigitalOceanRecord;
		}>(config, path);

		if (existing.type === record.type) {
			await doFetch(config, path, {
				method: "PUT",
				body: JSON.stringify(payload),
			});
			return { id: recordId };
		}

		// The API does not document PUT as able to change a record's type, so a
		// type change replaces the record. The delete has to come first: a CNAME
		// cannot sit alongside other records on the same name. If the creation
		// then fails, put the original back rather than leaving the name empty.
		await doFetch(config, path, { method: "DELETE" });
		try {
			return await createRecord(config, zoneId, payload);
		} catch (error) {
			await restoreRecord(config, zoneId, existing, error);
			throw error;
		}
	},

	async deleteRecord(config, zoneId, recordId) {
		await doFetch(config, recordPath(zoneId, recordId), { method: "DELETE" });
	},

	async testConnection(config) {
		await doFetch(config, "/domains?per_page=1");
	},
};
