import type { autodnsDnsConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, type DnsRecordInput, dnsFetch } from "./types";

type AutoDnsConfig = z.infer<typeof autodnsDnsConfigSchema>;

interface AutoDnsResourceRecord {
	name: string;
	ttl?: number;
	type: string;
	value: string;
	pref?: number;
}

interface AutoDnsZone {
	origin: string;
	virtualNameServer: string;
	resourceRecords?: AutoDnsResourceRecord[];
}

interface AutoDnsResponse<T> {
	status?: {
		code?: string;
		text?: string;
		type?: string;
	};
	messages?: {
		code?: string;
		text?: string;
		status?: string;
	}[];
	object?: {
		summary?: number;
		data?: T;
	};
	data?: T[] | T;
}

interface AutoDnsZoneId {
	origin: string;
	virtualNameServer: string;
}

const AUTODNS_API_ENDPOINT = "https://api.autodns.com/v1";
const stripTrailingDot = (value: string) => value.replace(/\.$/, "");

const buildZoneId = (zone: AutoDnsZoneId) =>
	Buffer.from(JSON.stringify(zone)).toString("base64url");

const parseZoneId = (zoneId: string): AutoDnsZoneId => {
	try {
		const parsed = JSON.parse(
			Buffer.from(zoneId, "base64url").toString("utf8"),
		) as AutoDnsZoneId;
		if (!parsed.origin || !parsed.virtualNameServer) {
			throw new Error("missing zone identifier fields");
		}
		return parsed;
	} catch {
		throw new Error("Invalid AutoDNS zone id");
	}
};

const buildRecordId = (record: AutoDnsResourceRecord) =>
	Buffer.from(JSON.stringify(record)).toString("base64url");

const parseRecordId = (recordId: string): AutoDnsResourceRecord => {
	try {
		const parsed = JSON.parse(
			Buffer.from(recordId, "base64url").toString("utf8"),
		) as AutoDnsResourceRecord;
		if (!parsed.type || parsed.name === undefined || !parsed.value) {
			throw new Error("missing record identifier fields");
		}
		return parsed;
	} catch {
		throw new Error("Invalid AutoDNS record id");
	}
};

const toRelativeName = (name: string, origin: string) => {
	const normalizedName = stripTrailingDot(name.trim());
	const normalizedOrigin = stripTrailingDot(origin);
	if (normalizedName === "@" || normalizedName === normalizedOrigin) {
		return "";
	}
	const suffix = `.${normalizedOrigin}`;
	return normalizedName.endsWith(suffix)
		? normalizedName.slice(0, -suffix.length)
		: normalizedName;
};

const toAbsoluteName = (name: string, origin: string) => {
	const normalizedName = stripTrailingDot(name.trim());
	const normalizedOrigin = stripTrailingDot(origin);
	if (!normalizedName || normalizedName === "@") {
		return normalizedOrigin;
	}
	return normalizedName === normalizedOrigin ||
		normalizedName.endsWith(`.${normalizedOrigin}`)
		? normalizedName
		: `${normalizedName}.${normalizedOrigin}`;
};

const toAutoDnsRecord = (
	record: Omit<DnsRecordInput, "zoneId">,
	origin: string,
): AutoDnsResourceRecord => ({
	name: toRelativeName(record.name, origin),
	ttl: record.ttl ?? 300,
	type: record.type,
	value: record.content,
});

const autoDnsFetch = async <T>(
	config: AutoDnsConfig,
	path: string,
	init: RequestInit = {},
): Promise<AutoDnsResponse<T>> => {
	const response = await dnsFetch(`${AUTODNS_API_ENDPOINT}${path}`, {
		...init,
		headers: {
			Accept: "application/json",
			Authorization: `Basic ${Buffer.from(
				`${config.user.trim()}:${config.password.trim()}`,
			).toString("base64")}`,
			"Content-Type": "application/json",
			"X-Domainrobot-Context": String(config.context),
			...init.headers,
		},
	});

	const rawBody = await response.text();
	let body: AutoDnsResponse<T> = {};
	if (rawBody) {
		try {
			body = JSON.parse(rawBody) as AutoDnsResponse<T>;
		} catch {
			throw new Error(
				`AutoDNS: request to ${path} returned an invalid response (status ${response.status})`,
			);
		}
	}

	const statusType = body.status?.type?.toUpperCase();
	if (!response.ok || (statusType && statusType !== "SUCCESS")) {
		const detail =
			body.messages
				?.map(({ code, text }) => [code, text].filter(Boolean).join(": "))
				.filter(Boolean)
				.join("; ") ||
			body.status?.text ||
			body.status?.code;
		throw new Error(
			`AutoDNS: request to ${path} failed${detail ? `: ${detail}` : ` (status ${response.status})`}`,
		);
	}

	return body;
};

const getZone = async (config: AutoDnsConfig, zoneId: string) => {
	const { origin, virtualNameServer } = parseZoneId(zoneId);
	const body = await autoDnsFetch<AutoDnsZone>(
		config,
		`/zone/${encodeURIComponent(origin)}/${encodeURIComponent(virtualNameServer)}`,
	);
	const zone = Array.isArray(body.data)
		? body.data[0]
		: (body.data ?? body.object?.data);
	if (!zone) {
		throw new Error(`AutoDNS: zone "${origin}" was not returned by the API`);
	}
	return zone;
};

const streamRecords = async (
	config: AutoDnsConfig,
	zoneId: string,
	changes: {
		adds?: AutoDnsResourceRecord[];
		rems?: AutoDnsResourceRecord[];
	},
) => {
	const { origin, virtualNameServer } = parseZoneId(zoneId);
	await autoDnsFetch(
		config,
		`/zone/${encodeURIComponent(origin)}/${encodeURIComponent(virtualNameServer)}/_stream`,
		{
			method: "POST",
			body: JSON.stringify({
				adds: changes.adds ?? [],
				rems: changes.rems ?? [],
			}),
		},
	);
};

const recordsEqual = (a: AutoDnsResourceRecord, b: AutoDnsResourceRecord) =>
	a.name === b.name &&
	a.type === b.type &&
	a.value === b.value &&
	(a.ttl ?? 300) === (b.ttl ?? 300) &&
	(a.pref ?? 0) === (b.pref ?? 0);

export const autodnsClient: DnsClient<AutoDnsConfig> = {
	async listZones(config) {
		const zones: AutoDnsZone[] = [];
		const limit = 100;
		let offset = 0;
		let total = 0;
		do {
			const body = await autoDnsFetch<AutoDnsZone>(
				config,
				"/zone/_search?keys[]=virtualNameServer",
				{
					method: "POST",
					body: JSON.stringify({
						filters: [],
						view: { limit, offset, children: true },
					}),
				},
			);
			const page = Array.isArray(body.data)
				? body.data
				: body.data
					? [body.data]
					: [];
			zones.push(...page);
			total = body.object?.summary ?? zones.length;
			offset += page.length;
			if (page.length === 0) break;
		} while (offset < total);

		return zones
			.filter((zone) => zone.origin && zone.virtualNameServer)
			.map((zone) => ({
				id: buildZoneId(zone),
				name: stripTrailingDot(zone.origin),
			}));
	},

	async listRecords(config, zoneId) {
		const zone = await getZone(config, zoneId);
		return (zone.resourceRecords ?? []).map((record) => ({
			id: buildRecordId(record),
			type: record.type,
			name: toAbsoluteName(record.name, zone.origin),
			content: record.value,
			ttl: record.ttl ?? 300,
		}));
	},

	async upsertRecord(config, record) {
		const zone = await getZone(config, record.zoneId);
		const desired = toAutoDnsRecord(record, zone.origin);
		const existing = (zone.resourceRecords ?? []).filter(
			(candidate) =>
				candidate.type === desired.type &&
				toRelativeName(candidate.name, zone.origin) === desired.name,
		);

		if (existing.length === 1 && recordsEqual(existing[0]!, desired)) {
			return { id: buildRecordId(existing[0]!) };
		}

		await streamRecords(config, record.zoneId, {
			adds: [desired],
			rems: existing,
		});
		return { id: buildRecordId(desired) };
	},

	async updateRecord(config, zoneId, recordId, record) {
		const zone = await getZone(config, zoneId);
		const existing = parseRecordId(recordId);
		const desired = toAutoDnsRecord(record, zone.origin);
		if (!recordsEqual(existing, desired)) {
			await streamRecords(config, zoneId, {
				adds: [desired],
				rems: [existing],
			});
		}
		return { id: buildRecordId(desired) };
	},

	async deleteRecord(config, zoneId, recordId) {
		await streamRecords(config, zoneId, {
			rems: [parseRecordId(recordId)],
		});
	},

	async testConnection(config) {
		await autoDnsFetch<AutoDnsZone>(config, "/zone/_search", {
			method: "POST",
			body: JSON.stringify({
				filters: [],
				view: { limit: 1, offset: 0, children: true },
			}),
		});
	},
};
