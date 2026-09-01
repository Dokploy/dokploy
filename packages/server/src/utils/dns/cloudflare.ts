import {
	type cloudflareDnsConfigSchema,
	proxiableDnsRecordTypes,
} from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type CloudflareConfig = z.infer<typeof cloudflareDnsConfigSchema>;

type CloudflareResponse<T> = {
	success: boolean;
	errors: { code: number; message: string }[];
	result: T;
	result_info?: { page: number; per_page: number; total_pages: number };
};

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

const inlinePriority = (record: {
	type: string;
	content: string;
	priority?: number;
}) =>
	record.type === "MX" && typeof record.priority === "number"
		? `${record.priority} ${record.content}`
		: record.content;

const proxySettings = (record: { type: string; proxied?: boolean }) =>
	record.proxied !== undefined &&
	(proxiableDnsRecordTypes as readonly string[]).includes(record.type)
		? { proxied: record.proxied }
		: {};

const buildValue = (record: { type: string; content: string }) => {
	const value = record.content.trim();

	if (record.type === "MX") {
		const match = /^(\d+)\s+(\S.*)$/.exec(value);
		return match
			? { content: match[2] as string, priority: Number(match[1]) }
			: { content: value, priority: 10 };
	}

	if (record.type === "SRV") {
		const parts = value.split(/\s+/);
		const [priority, weight, port, target] = parts;
		if (parts.length !== 4 || !target) {
			throw new Error(
				`Cloudflare: an SRV value must be "priority weight port target", got "${value}"`,
			);
		}
		return {
			data: {
				priority: Number(priority),
				weight: Number(weight),
				port: Number(port),
				target,
			},
		};
	}

	if (record.type === "CAA") {
		const match = /^(\d+)\s+(\S+)\s+"?([^"]+)"?$/.exec(value);
		if (!match) {
			throw new Error(
				`Cloudflare: a CAA value must be \`flags tag "value"\`, got "${value}"`,
			);
		}
		return {
			data: {
				flags: Number(match[1]),
				tag: match[2] as string,
				value: match[3] as string,
			},
		};
	}

	return { content: value };
};

const cfFetch = async <T>(
	config: CloudflareConfig,
	path: string,
	init: RequestInit = {},
): Promise<T> => {
	const response = await dnsFetch(`${CLOUDFLARE_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${config.apiToken.trim()}`,
			"Content-Type": "application/json",
			...init.headers,
		},
	});

	const body = (await response.json()) as CloudflareResponse<T>;
	if (!response.ok || !body.success) {
		const detail = body.errors?.map((e) => e.message).join(", ");
		throw new Error(
			`Cloudflare: request to ${path} failed${detail ? `: ${detail}` : ` (status ${response.status})`}`,
		);
	}
	return body.result;
};

export const cloudflareClient: DnsClient<CloudflareConfig> = {
	async listZones(config) {
		const zones: { id: string; name: string }[] = [];
		let page = 1;
		while (true) {
			const result = await cfFetch<{ id: string; name: string }[]>(
				config,
				`/zones?per_page=50&page=${page}`,
			);
			zones.push(...result.map((zone) => ({ id: zone.id, name: zone.name })));
			if (result.length < 50) {
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
		}[] = [];
		let page = 1;
		while (true) {
			const result = await cfFetch<
				{
					id: string;
					type: string;
					name: string;
					content: string;
					ttl: number;
					priority?: number;
					proxied?: boolean;
				}[]
			>(config, `/zones/${zoneId}/dns_records?per_page=50&page=${page}`);
			records.push(
				...result.map((record) => ({
					id: record.id,
					type: record.type,
					name: record.name,
					content: inlinePriority(record),
					ttl: record.ttl,
					proxied: record.proxied,
				})),
			);
			if (result.length < 50) {
				break;
			}
			page += 1;
		}
		return records;
	},

	async upsertRecord(config, record) {
		const payload = {
			type: record.type,
			name: record.name,
			...buildValue(record),
			...proxySettings(record),
			ttl: record.ttl ?? 1,
		};

		const existing = await cfFetch<{ id: string }[]>(
			config,
			`/zones/${record.zoneId}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`,
		);

		const existingRecord = existing[0];
		if (existingRecord) {
			const updated = await cfFetch<{ id: string }>(
				config,
				`/zones/${record.zoneId}/dns_records/${existingRecord.id}`,
				{ method: "PUT", body: JSON.stringify(payload) },
			);
			return { id: updated.id };
		}

		const created = await cfFetch<{ id: string }>(
			config,
			`/zones/${record.zoneId}/dns_records`,
			{ method: "POST", body: JSON.stringify(payload) },
		);
		return { id: created.id };
	},

	async updateRecord(config, zoneId, recordId, record) {
		const updated = await cfFetch<{ id: string }>(
			config,
			`/zones/${zoneId}/dns_records/${recordId}`,
			{
				method: "PUT",
				body: JSON.stringify({
					type: record.type,
					name: record.name,
					...buildValue(record),
					...proxySettings(record),
					ttl: record.ttl ?? 1,
				}),
			},
		);
		return { id: updated.id };
	},

	async deleteRecord(config, zoneId, recordId) {
		await cfFetch(config, `/zones/${zoneId}/dns_records/${recordId}`, {
			method: "DELETE",
		});
	},

	async testConnection(config) {
		await cfFetch(config, "/zones?per_page=1");
	},
};
