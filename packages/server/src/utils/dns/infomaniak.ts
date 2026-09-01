import type { infomaniakDnsConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type InfomaniakConfig = z.infer<typeof infomaniakDnsConfigSchema>;

interface InfomaniakResponse<T> {
	result: "success" | "error";
	data?: T;
	error?: { code?: string; description?: string };
	page?: number;
	pages?: number;
	total?: number;
}

interface InfomaniakRecord {
	id: number | string;
	type: string;
	source: string;
	target: string;
	ttl: number;
}

interface InfomaniakDomain {
	id: number;
	customer_name: string;
}

const INFOMANIAK_API = "https://api.infomaniak.com";

// Infomaniak requires a TTL on every record, within a 60..86400 range.
const DEFAULT_TTL = 300;

const ikRequest = async <T>(
	config: InfomaniakConfig,
	path: string,
	init: RequestInit = {},
): Promise<InfomaniakResponse<T>> => {
	const response = await dnsFetch(`${INFOMANIAK_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${config.apiToken.trim()}`,
			"Content-Type": "application/json",
			...init.headers,
		},
	});

	const body = (await response.json()) as InfomaniakResponse<T>;
	if (!response.ok || body.result !== "success") {
		const detail = body.error?.description ?? body.error?.code;
		throw new Error(
			`Infomaniak: request to ${path} failed${
				detail ? `: ${detail}` : ` (status ${response.status})`
			}`,
		);
	}
	return body;
};

const ikFetch = async <T>(
	config: InfomaniakConfig,
	path: string,
	init: RequestInit = {},
): Promise<T> => (await ikRequest<T>(config, path, init)).data as T;

// Infomaniak's "source" holds the subdomain only, relative to the zone. The apex
// is a bare root dot; "" and "@" are accepted too so a hand-written record still
// round-trips.
const APEX_SOURCES = new Set(["", ".", "@"]);

const toSource = (name: string, zone: string) => {
	const fqdn = name.replace(/\.$/, "");
	if (fqdn === zone) {
		return ".";
	}
	const suffix = `.${zone}`;
	return fqdn.endsWith(suffix) ? fqdn.slice(0, -suffix.length) : fqdn;
};

const toFqdn = (source: string, zone: string) =>
	APEX_SOURCES.has(source) ? zone : `${source}.${zone}`;

// toSource always writes the apex as ".", so an existing record stored under one
// of the other apex spellings has to normalize to the same thing before it can
// be matched.
const normalizeSource = (source: string) =>
	APEX_SOURCES.has(source) ? "." : source;

// TXT targets are stored quoted; keep Dokploy's view of them unquoted so that
// editing a record does not stack a new pair of quotes on every save.
const unquoteTarget = (target: string) => {
	if (target.length >= 2 && target.startsWith('"') && target.endsWith('"')) {
		try {
			const unquoted: unknown = JSON.parse(target);
			if (typeof unquoted === "string") {
				return unquoted;
			}
		} catch {
			return target;
		}
	}
	return target;
};

const quoteTarget = (type: string, content: string) => {
	const value = content.trim();
	if (type !== "TXT") {
		return value;
	}
	return value.startsWith('"') && value.endsWith('"')
		? value
		: JSON.stringify(value);
};

const recordPayload = (
	record: { type: string; name: string; content: string; ttl?: number },
	zone: string,
) => ({
	type: record.type,
	source: toSource(record.name, zone),
	target: quoteTarget(record.type, record.content),
	ttl: record.ttl ?? DEFAULT_TTL,
});

const PRODUCTS_PER_PAGE = 100;

// The products endpoint paginates — 15 per page by default — so an account with
// more domains than fit on one page would otherwise silently lose zones.
const listDomainProducts = async (config: InfomaniakConfig) => {
	const domains: InfomaniakDomain[] = [];
	let page = 1;
	while (true) {
		const body = await ikRequest<InfomaniakDomain[]>(
			config,
			`/1/products?service_name=domain&page=${page}&per_page=${PRODUCTS_PER_PAGE}`,
		);
		domains.push(...(body.data ?? []));
		if (page >= (body.pages ?? 1)) {
			return domains;
		}
		page += 1;
	}
};

const listZoneRecords = async (config: InfomaniakConfig, zoneId: string) =>
	await ikFetch<InfomaniakRecord[]>(
		config,
		`/2/zones/${encodeURIComponent(zoneId)}/records?with=records_description`,
	);

export const infomaniakClient: DnsClient<InfomaniakConfig> = {
	async listZones(config) {
		const domains = await listDomainProducts(config);
		// The v2 record endpoints are keyed by zone name, not by product id.
		return domains.map((domain) => ({
			id: domain.customer_name,
			name: domain.customer_name,
		}));
	},

	async listRecords(config, zoneId) {
		const records = await listZoneRecords(config, zoneId);
		return records.map((record) => ({
			id: String(record.id),
			type: record.type,
			name: toFqdn(record.source, zoneId),
			content: unquoteTarget(record.target),
			ttl: Number(record.ttl),
		}));
	},

	async upsertRecord(config, record) {
		const source = toSource(record.name, record.zoneId);
		const existing = await listZoneRecords(config, record.zoneId);
		const match = existing.find(
			(candidate) =>
				candidate.type === record.type &&
				normalizeSource(candidate.source) === source,
		);

		const body = JSON.stringify(recordPayload(record, record.zoneId));
		const zone = encodeURIComponent(record.zoneId);

		if (match) {
			await ikFetch(config, `/2/zones/${zone}/records/${match.id}`, {
				method: "PUT",
				body,
			});
			return { id: String(match.id) };
		}

		const created = await ikFetch<InfomaniakRecord>(
			config,
			`/2/zones/${zone}/records`,
			{ method: "POST", body },
		);
		// The API returns the created record, but older responses only carry its id.
		return {
			id:
				typeof created === "object" && created !== null
					? String(created.id)
					: String(created),
		};
	},

	async updateRecord(config, zoneId, recordId, record) {
		await ikFetch(
			config,
			`/2/zones/${encodeURIComponent(zoneId)}/records/${recordId}`,
			{ method: "PUT", body: JSON.stringify(recordPayload(record, zoneId)) },
		);
		return { id: recordId };
	},

	async deleteRecord(config, zoneId, recordId) {
		await ikFetch(
			config,
			`/2/zones/${encodeURIComponent(zoneId)}/records/${recordId}`,
			{ method: "DELETE" },
		);
	},

	async testConnection(config) {
		await ikFetch(config, "/1/products?service_name=domain&per_page=1");
	},
};
