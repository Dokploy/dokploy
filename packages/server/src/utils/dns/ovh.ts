import { createHash } from "node:crypto";
import type { ovhDnsConfigSchema } from "@dokploy/server/db/schema";
import type { z } from "zod";
import { type DnsClient, dnsFetch } from "./types";

type OvhConfig = z.infer<typeof ovhDnsConfigSchema>;

interface OvhRecord {
	id: number;
	zone: string;
	fieldType: string;
	subDomain: string | null;
	target: string;
	ttl: number | null;
}

const OVH_ENDPOINTS: Record<OvhConfig["endpoint"], string> = {
	"ovh-eu": "https://eu.api.ovh.com/1.0",
	"ovh-ca": "https://ca.api.ovh.com/1.0",
	"ovh-us": "https://api.us.ovhcloud.com/1.0",
	"kimsufi-eu": "https://eu.api.kimsufi.com/1.0",
	"kimsufi-ca": "https://ca.api.kimsufi.com/1.0",
	"soyoustart-eu": "https://eu.api.soyoustart.com/1.0",
	"soyoustart-ca": "https://ca.api.soyoustart.com/1.0",
};

// Fetching every record of a zone takes one call per record, so cap how many of
// them are in flight at once.
const RECORD_CONCURRENCY = 8;

// Requests are signed with the API's own clock: a local clock more than a few
// seconds off would get every call rejected. The drift is re-measured
// periodically in case the host clock is corrected under us.
const CLOCK_SKEW_TTL_MS = 60 * 60 * 1000;

const clockSkews = new Map<
	string,
	{ deltaSeconds: number; measuredAt: number }
>();

const localTimestamp = () => Math.floor(Date.now() / 1000);

const getTimestamp = async (baseUrl: string) => {
	const cached = clockSkews.get(baseUrl);
	if (cached && Date.now() - cached.measuredAt < CLOCK_SKEW_TTL_MS) {
		return localTimestamp() + cached.deltaSeconds;
	}

	const response = await dnsFetch(`${baseUrl}/auth/time`);
	const serverTime = Number(await response.text());
	if (!response.ok || !Number.isFinite(serverTime)) {
		throw new Error(
			`OVH: could not read the API server time (status ${response.status})`,
		);
	}

	const deltaSeconds = serverTime - localTimestamp();
	clockSkews.set(baseUrl, { deltaSeconds, measuredAt: Date.now() });
	return localTimestamp() + deltaSeconds;
};

const sign = (
	config: OvhConfig,
	method: string,
	url: string,
	body: string,
	timestamp: number,
) => {
	const digest = createHash("sha1")
		.update(
			[
				config.applicationSecret,
				config.consumerKey,
				method,
				url,
				body,
				timestamp,
			].join("+"),
		)
		.digest("hex");
	return `$1$${digest}`;
};

const ovhFetch = async <T>(
	config: OvhConfig,
	path: string,
	init: { method?: string; body?: unknown } = {},
): Promise<T> => {
	const baseUrl = OVH_ENDPOINTS[config.endpoint];
	const url = `${baseUrl}${path}`;
	const method = init.method ?? "GET";
	const body = init.body === undefined ? "" : JSON.stringify(init.body);
	const timestamp = await getTimestamp(baseUrl);

	const response = await dnsFetch(url, {
		method,
		...(body ? { body } : {}),
		headers: {
			"Content-Type": "application/json",
			"X-Ovh-Application": config.applicationKey,
			"X-Ovh-Consumer": config.consumerKey,
			"X-Ovh-Timestamp": String(timestamp),
			"X-Ovh-Signature": sign(config, method, url, body, timestamp),
		},
	});

	const text = await response.text();
	let payload: unknown = null;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = null;
		}
	}

	if (!response.ok) {
		const detail =
			payload && typeof payload === "object" && "message" in payload
				? String((payload as { message: unknown }).message)
				: undefined;
		throw new Error(
			`OVH: request to ${method} ${path} failed${
				detail ? `: ${detail}` : ` (status ${response.status})`
			}`,
		);
	}

	return payload as T;
};

// OVH addresses records by their subdomain, relative to the zone and empty for
// the apex, while Dokploy works with fully-qualified names.
const toSubDomain = (name: string, zone: string) => {
	const fqdn = name.replace(/\.$/, "");
	if (fqdn === zone) {
		return "";
	}
	const suffix = `.${zone}`;
	return fqdn.endsWith(suffix) ? fqdn.slice(0, -suffix.length) : fqdn;
};

const toFqdn = (subDomain: string | null, zone: string) =>
	subDomain ? `${subDomain}.${zone}` : zone;

const mapWithConcurrency = async <T, R>(
	items: T[],
	limit: number,
	run: (item: T) => Promise<R>,
) => {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (cursor < items.length) {
				const index = cursor;
				cursor += 1;
				results[index] = await run(items[index] as T);
			}
		},
	);
	await Promise.all(workers);
	return results;
};

// OVH only applies zone changes once the zone is explicitly refreshed. This runs
// after the record write has already succeeded, so a failure here means the
// change exists at the provider but is not being served yet. Rolling the write
// back would destroy correct state over a publish failure, so say what actually
// happened instead of letting the caller read it as "nothing was applied".
const refreshZone = async (config: OvhConfig, zone: string) => {
	try {
		await ovhFetch(config, `/domain/zone/${encodeURIComponent(zone)}/refresh`, {
			method: "POST",
		});
	} catch (error) {
		throw new Error(
			`OVH: the record change was applied, but refreshing zone "${zone}" failed, so it is not served yet. The next successful change to this zone will publish it, or you can refresh the zone from the OVH manager. Cause: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
};

// Used to undo the delete half of a type change when the replacement fails.
const restoreRecord = async (
	config: OvhConfig,
	zone: string,
	record: OvhRecord,
	cause: unknown,
) => {
	try {
		await ovhFetch(config, `/domain/zone/${encodeURIComponent(zone)}/record`, {
			method: "POST",
			body: {
				fieldType: record.fieldType,
				subDomain: record.subDomain ?? "",
				target: record.target,
				...(record.ttl === null ? {} : { ttl: record.ttl }),
			},
		});
		await refreshZone(config, zone);
	} catch {
		const name = toFqdn(record.subDomain, zone);
		throw new Error(
			`OVH: could not replace the record and could not restore the original one, which has been deleted. Recreate it manually: ${record.fieldType} ${name} -> ${record.target}. Original failure: ${
				cause instanceof Error ? cause.message : String(cause)
			}`,
		);
	}
};

const recordBody = (
	record: { name: string; content: string; ttl?: number },
	zone: string,
) => ({
	subDomain: toSubDomain(record.name, zone),
	target: record.content,
	// Leaving the ttl out lets OVH apply the zone's default.
	...(record.ttl === undefined ? {} : { ttl: record.ttl }),
});

// OVH grants access per exact path: a `/domain/zone/*` rule covers the subtree
// but not the bare `/domain/zone` listing, which needs its own rule. That is an
// easy one to leave out of a token, so say so plainly rather than surfacing a
// bare "This call has not been granted".
const listZoneNames = async (config: OvhConfig) => {
	try {
		return await ovhFetch<string[]>(config, "/domain/zone");
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("has not been granted")
		) {
			throw new Error(
				"OVH: the credentials are missing the `GET /domain/zone` right, which lists your zones. A `GET /domain/zone/*` rule does not cover it — add the rule without the wildcard as well.",
			);
		}
		throw error;
	}
};

export const ovhClient: DnsClient<OvhConfig> = {
	async listZones(config) {
		const zones = await listZoneNames(config);
		return zones.map((zone) => ({ id: zone, name: zone }));
	},

	async listRecords(config, zoneId) {
		const zone = encodeURIComponent(zoneId);
		// The listing endpoint only returns ids, so each record is fetched on its own.
		const ids = await ovhFetch<number[]>(config, `/domain/zone/${zone}/record`);
		const records = await mapWithConcurrency(ids, RECORD_CONCURRENCY, (id) =>
			ovhFetch<OvhRecord>(config, `/domain/zone/${zone}/record/${id}`),
		);

		return records.map((record) => ({
			id: String(record.id),
			type: record.fieldType,
			name: toFqdn(record.subDomain, zoneId),
			content: record.target,
			ttl: record.ttl ?? 0,
		}));
	},

	async upsertRecord(config, record) {
		const zone = encodeURIComponent(record.zoneId);
		const subDomain = toSubDomain(record.name, record.zoneId);
		const existing = await ovhFetch<number[]>(
			config,
			`/domain/zone/${zone}/record?fieldType=${encodeURIComponent(
				record.type,
			)}&subDomain=${encodeURIComponent(subDomain)}`,
		);

		const existingId = existing[0];
		if (existingId !== undefined) {
			await ovhFetch(config, `/domain/zone/${zone}/record/${existingId}`, {
				method: "PUT",
				body: recordBody(record, record.zoneId),
			});
			await refreshZone(config, record.zoneId);
			return { id: String(existingId) };
		}

		const created = await ovhFetch<OvhRecord>(
			config,
			`/domain/zone/${zone}/record`,
			{
				method: "POST",
				body: { fieldType: record.type, ...recordBody(record, record.zoneId) },
			},
		);
		await refreshZone(config, record.zoneId);
		return { id: String(created.id) };
	},

	async updateRecord(config, zoneId, recordId, record) {
		const zone = encodeURIComponent(zoneId);
		const existing = await ovhFetch<OvhRecord>(
			config,
			`/domain/zone/${zone}/record/${recordId}`,
		);

		// The update payload carries no fieldType, so switching a record's type
		// means replacing it. The delete has to come first: OVH rejects a CNAME
		// that would sit alongside other data on the same name. If the creation
		// then fails, put the original record back rather than leaving the name
		// with nothing.
		if (existing.fieldType !== record.type) {
			await ovhFetch(config, `/domain/zone/${zone}/record/${recordId}`, {
				method: "DELETE",
			});

			let created: OvhRecord;
			try {
				created = await ovhFetch<OvhRecord>(
					config,
					`/domain/zone/${zone}/record`,
					{
						method: "POST",
						body: { fieldType: record.type, ...recordBody(record, zoneId) },
					},
				);
			} catch (error) {
				await restoreRecord(config, zoneId, existing, error);
				throw error;
			}

			await refreshZone(config, zoneId);
			return { id: String(created.id) };
		}

		await ovhFetch(config, `/domain/zone/${zone}/record/${recordId}`, {
			method: "PUT",
			body: recordBody(record, zoneId),
		});
		await refreshZone(config, zoneId);
		return { id: recordId };
	},

	async deleteRecord(config, zoneId, recordId) {
		await ovhFetch(
			config,
			`/domain/zone/${encodeURIComponent(zoneId)}/record/${recordId}`,
			{ method: "DELETE" },
		);
		await refreshZone(config, zoneId);
	},

	async testConnection(config) {
		await listZoneNames(config);
	},
};
