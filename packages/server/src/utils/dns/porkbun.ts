import type { porkbunDnsConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type PorkbunConfig = z.infer<typeof porkbunDnsConfigSchema>;

type PorkbunResponse<T> = T & {
	status: "SUCCESS" | "ERROR";
	message?: string;
};

const PORKBUN_API = "https://api.porkbun.com/api/json/v3";

const pbFetch = async <T>(
	config: PorkbunConfig,
	path: string,
	body: Record<string, unknown> = {},
): Promise<PorkbunResponse<T>> => {
	const response = await dnsFetch(`${PORKBUN_API}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			apikey: config.apiKey,
			secretapikey: config.secretApiKey,
			...body,
		}),
	});

	const result = (await response.json()) as PorkbunResponse<T>;
	if (!response.ok || result.status !== "SUCCESS") {
		throw new Error(
			`Porkbun: request to ${path} failed${
				result.message ? `: ${result.message}` : ` (status ${response.status})`
			}`,
		);
	}
	return result;
};

// Porkbun's "name" only accepts the subdomain portion, without the zone (domain) itself.
const toSubdomain = (name: string, domain: string) => {
	if (name === domain) {
		return "";
	}
	const suffix = `.${domain}`;
	return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
};

interface PorkbunRecord {
	id: string;
	name: string;
	type: string;
	content: string;
	ttl: string;
	prio: string;
	notes: string;
}

export const porkbunClient: DnsClient<PorkbunConfig> = {
	async listZones(config) {
		const result = await pbFetch<{ domains: { domain: string }[] }>(
			config,
			"/domain/listAll",
		);
		return result.domains.map((domain) => ({
			id: domain.domain,
			name: domain.domain,
		}));
	},

	async listRecords(config, zoneId) {
		const result = await pbFetch<{ records: PorkbunRecord[] }>(
			config,
			`/dns/retrieve/${zoneId}`,
		);
		return result.records.map((record) => ({
			id: record.id,
			type: record.type,
			name: record.name,
			content: record.content,
			ttl: Number(record.ttl),
		}));
	},

	async upsertRecord(config, record) {
		const subdomain = toSubdomain(record.name, record.zoneId);
		const existing = await pbFetch<{ records: PorkbunRecord[] }>(
			config,
			`/dns/retrieveByNameType/${record.zoneId}/${record.type}/${subdomain}`,
		);

		const payload = {
			name: subdomain,
			type: record.type,
			content: record.content,
			ttl: record.ttl ?? 600,
		};

		const existingRecord = existing.records[0];
		if (existingRecord) {
			await pbFetch(
				config,
				`/dns/edit/${record.zoneId}/${existingRecord.id}`,
				payload,
			);
			return { id: existingRecord.id };
		}

		const created = await pbFetch<{ id: string }>(
			config,
			`/dns/create/${record.zoneId}`,
			payload,
		);
		return { id: created.id };
	},

	async updateRecord(config, zoneId, recordId, record) {
		await pbFetch(config, `/dns/edit/${zoneId}/${recordId}`, {
			name: toSubdomain(record.name, zoneId),
			type: record.type,
			content: record.content,
			ttl: record.ttl ?? 600,
		});
		return { id: recordId };
	},

	async deleteRecord(config, zoneId, recordId) {
		await pbFetch(config, `/dns/delete/${zoneId}/${recordId}`);
	},

	async testConnection(config) {
		await pbFetch(config, "/ping");
	},
};
