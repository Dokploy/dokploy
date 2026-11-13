import type { hetznerDnsConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type HetznerConfig = z.infer<typeof hetznerDnsConfigSchema>;

interface HetznerErrorBody {
	error?: { code?: string; message?: string };
}

interface HetznerPagination {
	page: number;
	next_page: number | null;
}

interface HetznerZone {
	id: number;
	name: string;
	mode: "primary" | "secondary";
}

interface HetznerRRSet {
	id: string;
	name: string;
	type: string;
	ttl: number | null;
	records: { value: string; comment?: string }[];
}

const HETZNER_API = "https://api.hetzner.cloud/v1";

// RRSets without their own TTL inherit the zone default, which the list endpoint
// does not repeat on every RRSet.
const DEFAULT_TTL = 300;

const PER_PAGE = 50;

class HetznerApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

const hzFetch = async <T>(
	config: HetznerConfig,
	path: string,
	init: RequestInit = {},
): Promise<T> => {
	const response = await dnsFetch(`${HETZNER_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${config.apiToken.trim()}`,
			"Content-Type": "application/json",
			...init.headers,
		},
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as HetznerErrorBody;
		const detail = body.error?.message ?? body.error?.code;
		throw new HetznerApiError(
			`Hetzner: request to ${path} failed${
				detail ? `: ${detail}` : ` (status ${response.status})`
			}`,
			response.status,
		);
	}

	if (response.status === 204) {
		return undefined as T;
	}
	return (await response.json()) as T;
};

// List endpoints cap per_page at 50, so accounts with more zones or RRSets than
// that span several pages.
const fetchAllPages = async <T>(
	config: HetznerConfig,
	path: string,
	key: string,
) => {
	const items: T[] = [];
	const separator = path.includes("?") ? "&" : "?";
	let page: number | null = 1;
	while (page) {
		const body: {
			[key: string]: unknown;
			meta?: { pagination?: HetznerPagination };
		} = await hzFetch(
			config,
			`${path}${separator}page=${page}&per_page=${PER_PAGE}`,
		);
		items.push(...((body[key] as T[] | undefined) ?? []));
		page = body.meta?.pagination?.next_page ?? null;
	}
	return items;
};

// RRSet names are relative to the zone, with "@" for the apex. Dokploy works
// with FQDNs, so both directions are translated here.
const toRRSetName = (name: string, zone: string) => {
	const fqdn = name.replace(/\.$/, "").toLowerCase();
	if (fqdn === zone || fqdn === "@" || fqdn === "") {
		return "@";
	}
	const suffix = `.${zone}`;
	return fqdn.endsWith(suffix) ? fqdn.slice(0, -suffix.length) : fqdn;
};

const toFqdn = (name: string, zone: string) =>
	name === "@" ? zone : `${name}.${zone}`;

const buildRecordId = (name: string, type: string) => `${name}/${type}`;

const parseRecordId = (id: string) => {
	const separatorIndex = id.lastIndexOf("/");
	if (separatorIndex === -1) {
		throw new Error(`Invalid Hetzner record id: "${id}"`);
	}
	return {
		name: id.slice(0, separatorIndex),
		type: id.slice(separatorIndex + 1),
	};
};

const TXT_CHUNK_SIZE = 255;

const isQuoted = (value: string) =>
	value.length >= 2 && value.startsWith('"') && value.endsWith('"');

// Hetzner expects TXT values as quoted strings of at most 255 characters,
// separated by spaces. Mirrors FormatTXTRecord in hcloud-go's zoneutil.
const formatTxtValue = (value: string) => {
	if (isQuoted(value)) {
		return value;
	}
	const escaped = value.replaceAll('"', '\\"');
	const chunks: string[] = [];
	for (let i = 0; i < escaped.length; i += TXT_CHUNK_SIZE) {
		chunks.push(`"${escaped.slice(i, i + TXT_CHUNK_SIZE)}"`);
	}
	return chunks.join(" ");
};

// Joins the quoted chunks back into one plain string so that editing a record
// does not stack a new pair of quotes on every save. Mirrors ParseTXTRecord in
// hcloud-go's zoneutil.
const parseTxtValue = (value: string) => {
	if (!value.startsWith('"')) {
		return value;
	}
	let result = "";
	let quoted = false;
	let escapeNext = false;
	for (const char of value) {
		if (escapeNext) {
			result += char;
			escapeNext = false;
		} else if (char === "\\") {
			escapeNext = true;
		} else if (char === '"') {
			quoted = !quoted;
		} else if (quoted) {
			result += char;
		}
	}
	return result;
};

const quoteValue = (type: string, value: string) =>
	type === "TXT" ? formatTxtValue(value) : value;

const unquoteValue = (type: string, value: string) =>
	type === "TXT" ? parseTxtValue(value) : value;

// Like Route53, one Dokploy record maps to a whole RRSet; several values are
// written one per line.
const toRecords = (type: string, content: string) =>
	[
		...new Set(
			content
				.split("\n")
				.map((value) => value.trim())
				.filter(Boolean)
				.map((value) => quoteValue(type, value)),
		),
	].map((value) => ({ value }));

const rrsetPath = (zoneId: string, name: string, type: string) =>
	`/zones/${encodeURIComponent(zoneId)}/rrsets/${encodeURIComponent(name)}/${type}`;

const findRRSet = async (
	config: HetznerConfig,
	zoneId: string,
	name: string,
	type: string,
) => {
	try {
		const body = await hzFetch<{ rrset: HetznerRRSet }>(
			config,
			rrsetPath(zoneId, name, type),
		);
		return body.rrset;
	} catch (error) {
		if (error instanceof HetznerApiError && error.status === 404) {
			return undefined;
		}
		throw error;
	}
};

export const hetznerClient: DnsClient<HetznerConfig> = {
	async listZones(config) {
		// Secondary zones are fed by AXFR and reject RRSet writes.
		const zones = await fetchAllPages<HetznerZone>(
			config,
			"/zones?mode=primary",
			"zones",
		);
		// The RRSet endpoints accept the zone name in place of its id, and the name
		// is needed anyway to translate record names.
		return zones.map((zone) => ({ id: zone.name, name: zone.name }));
	},

	async listRecords(config, zoneId) {
		const rrsets = await fetchAllPages<HetznerRRSet>(
			config,
			`/zones/${encodeURIComponent(zoneId)}/rrsets`,
			"rrsets",
		);
		return rrsets.map((rrset) => ({
			id: buildRecordId(rrset.name, rrset.type),
			type: rrset.type,
			name: toFqdn(rrset.name, zoneId),
			content: rrset.records
				.map((record) => unquoteValue(rrset.type, record.value))
				.join("\n"),
			ttl: rrset.ttl ?? DEFAULT_TTL,
		}));
	},

	async upsertRecord(config, record) {
		const name = toRRSetName(record.name, record.zoneId);
		const existing = await findRRSet(config, record.zoneId, name, record.type);
		const existingValues = new Set(existing?.records.map((r) => r.value));
		const records = toRecords(record.type, record.content).filter(
			(r) => !existingValues.has(r.value),
		);

		// add_records creates the RRSet when it is missing and appends otherwise,
		// matching Route53's merge-on-upsert behaviour.
		if (records.length > 0) {
			await hzFetch(
				config,
				`${rrsetPath(record.zoneId, name, record.type)}/actions/add_records`,
				{
					method: "POST",
					body: JSON.stringify({ ttl: record.ttl ?? null, records }),
				},
			);
		}
		return { id: buildRecordId(name, record.type) };
	},

	async updateRecord(config, zoneId, recordId, record) {
		const { name: oldName, type: oldType } = parseRecordId(recordId);
		const name = toRRSetName(record.name, zoneId);
		const records = toRecords(record.type, record.content);

		if (oldName === name && oldType === record.type) {
			const path = rrsetPath(zoneId, name, record.type);
			await hzFetch(config, `${path}/actions/set_records`, {
				method: "POST",
				body: JSON.stringify({ records }),
			});
			await hzFetch(config, `${path}/actions/change_ttl`, {
				method: "POST",
				body: JSON.stringify({ ttl: record.ttl ?? null }),
			});
			return { id: recordId };
		}

		await hzFetch(config, `/zones/${encodeURIComponent(zoneId)}/rrsets`, {
			method: "POST",
			body: JSON.stringify({
				name,
				type: record.type,
				ttl: record.ttl ?? null,
				records,
			}),
		});
		await hzFetch(config, rrsetPath(zoneId, oldName, oldType), {
			method: "DELETE",
		});
		return { id: buildRecordId(name, record.type) };
	},

	async deleteRecord(config, zoneId, recordId) {
		const { name, type } = parseRecordId(recordId);
		await hzFetch(config, rrsetPath(zoneId, name, type), { method: "DELETE" });
	},

	async testConnection(config) {
		await hzFetch(config, "/zones?per_page=1");
	},
};
