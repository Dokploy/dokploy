import type { arvancloudDnsConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type ArvanCloudConfig = z.infer<typeof arvancloudDnsConfigSchema>;

type ArvanPage<T> = {
	data: T;
	meta?: { current_page?: number; last_page?: number };
};

type ArvanRecord = {
	id?: string;
	type?: string;
	name?: string;
	value?: unknown;
	ttl?: number;
	cloud?: boolean;
};

const ARVAN_API = "https://napi.arvancloud.ir/cdn/4.0";

// ArvanCloud's record types are lowercase and differ slightly from the
// uppercase set Dokploy uses internally.
const typeToArvan = (type: string) => type.toLowerCase();
const typeFromArvan = (type: string) => type.toUpperCase();

// A record's "value" is an array of objects whose shape depends on the type.
// We normalise every record to a plain "content" string so it fits the shared
// DnsClient contract, then rebuild the ArvanCloud payload when writing.
const valueToContent = (type: string, value: unknown): string => {
	const items = Array.isArray(value) ? value : [value];
	const parts = items
		.map((item) => {
			if (!item || typeof item !== "object") {
				return "";
			}
			const v = item as Record<string, unknown>;
			switch (typeFromArvan(type)) {
				case "A":
				case "AAAA":
					return String(v.ip ?? "");
				case "CNAME":
				case "ANAME":
					return String(v.host ?? v.location ?? "");
				case "TXT":
				case "SPF":
				case "DKIM":
					return String(v.text ?? "");
				case "NS":
				case "PTR":
					return String(v.host ?? v.domain ?? "");
				case "MX":
					return v.priority != null
						? `${v.priority} ${v.host}`
						: String(v.host ?? "");
				case "SRV":
					return [v.priority, v.weight, v.port, v.target]
						.filter((x) => x != null)
						.join(" ");
				case "CAA":
					return [v.flags, v.tag, v.value].filter((x) => x != null).join(" ");
				default:
					return "";
			}
		})
		.filter(Boolean);
	return parts.join(" ");
};

const contentToValue = (type: string, content: string): unknown => {
	const value = content.trim();
	switch (typeFromArvan(type)) {
		case "A":
		case "AAAA":
			return [{ ip: value }];
		case "CNAME":
			return [{ host: value }];
		case "TXT":
		case "SPF":
		case "DKIM":
			return [{ text: value }];
		case "NS":
		case "PTR":
			return [{ host: value }];
		case "MX": {
			const match = /^(\d+)\s+(\S.*)$/.exec(value);
			return match
				? [{ host: match[2] as string, priority: Number(match[1]) }]
				: [{ host: value, priority: 10 }];
		}
		case "SRV": {
			const parts = value.split(/\s+/);
			const [priority, weight, port, target] = parts;
			if (parts.length !== 4 || !target) {
				throw new Error(
					`ArvanCloud: an SRV value must be "priority weight port target", got "${value}"`,
				);
			}
			return [
				{
					target,
					port: Number(port),
					weight: Number(weight),
					priority: Number(priority),
				},
			];
		}
		case "CAA": {
			// ArvanCloud only accepts { tag, value } (no flags field).
			const match = /^\d+\s+(\S+)\s+"?([^"]+)"?$/.exec(value);
			if (!match) {
				throw new Error(
					`ArvanCloud: a CAA value must be \`flags tag "value"\`, got "${value}"`,
				);
			}
			return [{ tag: match[1] as string, value: match[2] as string }];
		}
		default:
			throw new Error(`ArvanCloud: unsupported DNS record type "${type}"`);
	}
};

const arvanFetch = async <T>(
	config: ArvanCloudConfig,
	path: string,
	init: RequestInit = {},
): Promise<T> => {
	const response = await dnsFetch(`${ARVAN_API}${path}`, {
		...init,
		headers: {
			Authorization: `Apikey ${config.apiKey.trim()}`,
			Accept: "application/json",
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...init.headers,
		},
	});

	if (!response.ok) {
		const detail = await response
			.json()
			.then((body) => (body as { message?: string })?.message)
			.catch(() => undefined);
		throw new Error(
			`ArvanCloud: ${detail || `request to ${path} failed (status ${response.status})`}`,
		);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
};

// ArvanCloud addresses zones by their domain name in the URL, so we keep the
// name as the stable identifier for a zone.
export const arvancloudClient: DnsClient<ArvanCloudConfig> = {
	async listZones(config) {
		const zones: { id: string; name: string }[] = [];
		let page = 1;
		while (true) {
			const result = await arvanFetch<ArvanPage<{ name: string }[]>>(
				config,
				`/domains?per_page=100&page=${page}`,
			);
			zones.push(
				...result.data.map((zone) => ({ id: zone.name, name: zone.name })),
			);
			const lastPage = result.meta?.last_page ?? page;
			if (page >= lastPage) {
				break;
			}
			page += 1;
		}
		return zones;
	},

	async listRecords(config, zoneId) {
		const records: {
			id: string;
			type: string;
			name: string;
			content: string;
			ttl: number;
			proxied?: boolean;
		}[] = [];
		let page = 1;
		while (true) {
			const result = await arvanFetch<ArvanPage<ArvanRecord[]>>(
				config,
				`/domains/${encodeURIComponent(zoneId)}/dns-records?per_page=100&page=${page}`,
			);
			records.push(
				...result.data.map((record) => ({
					id: record.id ?? "",
					type: typeFromArvan(record.type ?? ""),
					name: record.name ?? "",
					content: valueToContent(record.type ?? "", record.value),
					ttl: record.ttl ?? 120,
					proxied: record.cloud,
				})),
			);
			const lastPage = result.meta?.last_page ?? page;
			if (page >= lastPage) {
				break;
			}
			page += 1;
		}
		return records;
	},

	async upsertRecord(config, record) {
		const type = typeToArvan(record.type);
		const value = contentToValue(record.type, record.content);

		const existing = await arvanFetch<ArvanPage<ArvanRecord[]>>(
			config,
			`/domains/${encodeURIComponent(record.zoneId)}/dns-records?type=${type}&name=${encodeURIComponent(record.name)}`,
		);

		const existingRecord = existing.data.find(
			(r) => valueToContent(type, r.value) === record.content.trim(),
		);
		if (existingRecord?.id) {
			await arvanFetch(
				config,
				`/domains/${encodeURIComponent(record.zoneId)}/dns-records/${existingRecord.id}`,
				{
					method: "PUT",
					body: JSON.stringify({
						type,
						name: record.name,
						value,
						ttl: record.ttl ?? 120,
						...(record.proxied !== undefined ? { cloud: record.proxied } : {}),
					}),
				},
			);
			return { id: existingRecord.id };
		}

		const created = await arvanFetch<{ data?: { id?: string } }>(
			config,
			`/domains/${encodeURIComponent(record.zoneId)}/dns-records`,
			{
				method: "POST",
				body: JSON.stringify({
					type,
					name: record.name,
					value,
					ttl: record.ttl ?? 120,
					...(record.proxied !== undefined ? { cloud: record.proxied } : {}),
				}),
			},
		);
		return { id: created.data?.id ?? "" };
	},

	async updateRecord(config, zoneId, recordId, record) {
		const type = typeToArvan(record.type);
		const value = contentToValue(record.type, record.content);

		await arvanFetch(
			config,
			`/domains/${encodeURIComponent(zoneId)}/dns-records/${recordId}`,
			{
				method: "PUT",
				body: JSON.stringify({
					type,
					name: record.name,
					value,
					ttl: record.ttl ?? 120,
					...(record.proxied !== undefined ? { cloud: record.proxied } : {}),
				}),
			},
		);
		return { id: recordId };
	},

	async deleteRecord(config, zoneId, recordId) {
		await arvanFetch(
			config,
			`/domains/${encodeURIComponent(zoneId)}/dns-records/${recordId}`,
			{ method: "DELETE" },
		);
	},

	async testConnection(config) {
		await arvanFetch<ArvanPage<unknown>>(config, "/domains?per_page=1");
	},
};