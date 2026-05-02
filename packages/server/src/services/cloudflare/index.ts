import { randomBytes } from "node:crypto";
import {
	CloudflareApiError,
	type CloudflareErrorEntry,
	type DnsRecord,
	type IngressRule,
	type TunnelInfo,
	type VerifyTokenResult,
	type Zone,
} from "./types";

export {
	CloudflareApiError,
	type DnsRecord,
	type IngressRule,
	type TunnelInfo,
	type VerifyTokenResult,
	type Zone,
};

const CF_BASE = "https://api.cloudflare.com/client/v4";
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

interface CfEnvelope<T> {
	success: boolean;
	errors: CloudflareErrorEntry[];
	messages: CloudflareErrorEntry[];
	result: T;
	result_info?: {
		page: number;
		per_page: number;
		total_pages: number;
		count: number;
		total_count: number;
	};
}

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRetryable = (status: number) => status === 429 || status >= 500;

const parseRetryAfter = (header: string | null): number | null => {
	if (!header) return null;
	const seconds = Number(header);
	if (!Number.isNaN(seconds)) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
	const date = Date.parse(header);
	if (!Number.isNaN(date)) {
		const delta = date - Date.now();
		if (delta > 0) return Math.min(delta, MAX_BACKOFF_MS);
	}
	return null;
};

const cfFetch = async <T>(
	token: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<CfEnvelope<T>> => {
	let attempt = 0;
	let backoff = INITIAL_BACKOFF_MS;
	while (true) {
		const response = await fetch(`${CF_BASE}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});

		if (response.ok) {
			const json = (await response.json()) as CfEnvelope<T>;
			if (!json.success) {
				throw new CloudflareApiError({
					status: response.status,
					errors: json.errors ?? [],
					retryable: false,
				});
			}
			return json;
		}

		let errors: CloudflareErrorEntry[] = [];
		try {
			const errJson = (await response.json()) as CfEnvelope<unknown>;
			errors = errJson.errors ?? [];
		} catch {
			// non-JSON error body — ignore
		}

		if (isRetryable(response.status) && attempt < MAX_RETRIES) {
			const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
			const wait = retryAfter ?? backoff;
			await sleep(wait);
			attempt += 1;
			backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
			continue;
		}

		throw new CloudflareApiError({
			status: response.status,
			errors,
			retryable: isRetryable(response.status),
		});
	}
};

export const verifyToken = async (
	token: string,
): Promise<VerifyTokenResult> => {
	try {
		const verify = await cfFetch<{
			id: string;
			status: string;
			expires_on: string | null;
		}>(token, "GET", "/user/tokens/verify");

		let accountId: string | null = null;
		try {
			const accounts = await cfFetch<Array<{ id: string; name: string }>>(
				token,
				"GET",
				"/accounts?per_page=1",
			);
			accountId = accounts.result[0]?.id ?? null;
		} catch {
			// Accounts list may fail with insufficient scopes; verify still succeeded
		}

		return {
			ok: verify.result.status === "active",
			accountId,
			scopes: [],
			expiresOn: verify.result.expires_on,
			status: verify.result.status,
		};
	} catch (err) {
		if (err instanceof CloudflareApiError) {
			return {
				ok: false,
				accountId: null,
				scopes: [],
				expiresOn: null,
				status: err.status === 401 ? "invalid" : "error",
			};
		}
		throw err;
	}
};

export const listZones = async (token: string): Promise<Zone[]> => {
	const zones: Zone[] = [];
	let page = 1;
	while (true) {
		const r = await cfFetch<Zone[]>(
			token,
			"GET",
			`/zones?per_page=50&page=${page}`,
		);
		zones.push(...r.result);
		const total = r.result_info?.total_pages ?? 1;
		if (page >= total) break;
		page += 1;
	}
	return zones;
};

export const createTunnel = async (
	token: string,
	accountId: string,
	name: string,
): Promise<{ id: string; token: string }> => {
	const tunnelSecret = randomBytes(32).toString("base64");
	const r = await cfFetch<{ id: string; token: string }>(
		token,
		"POST",
		`/accounts/${accountId}/cfd_tunnel`,
		{
			name,
			tunnel_secret: tunnelSecret,
			config_src: "cloudflare",
		},
	);

	if (r.result.token) {
		return { id: r.result.id, token: r.result.token };
	}

	const tokenResp = await cfFetch<string>(
		token,
		"GET",
		`/accounts/${accountId}/cfd_tunnel/${r.result.id}/token`,
	);
	return { id: r.result.id, token: tokenResp.result };
};

export const getTunnel = async (
	token: string,
	accountId: string,
	id: string,
): Promise<TunnelInfo> => {
	const r = await cfFetch<{
		id: string;
		status: string;
		conns_active_at?: string;
		connections?: Array<unknown>;
	}>(token, "GET", `/accounts/${accountId}/cfd_tunnel/${id}`);
	return {
		id: r.result.id,
		status: r.result.status,
		connections: r.result.connections?.length ?? 0,
	};
};

export const deleteTunnel = async (
	token: string,
	accountId: string,
	id: string,
): Promise<void> => {
	await cfFetch<unknown>(
		token,
		"DELETE",
		`/accounts/${accountId}/cfd_tunnel/${id}`,
	);
};

export const updateIngress = async (
	token: string,
	accountId: string,
	tunnelId: string,
	ingress: IngressRule[],
): Promise<void> => {
	await cfFetch<unknown>(
		token,
		"PUT",
		`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
		{ config: { ingress } },
	);
};

export const listDnsRecords = async (
	token: string,
	zoneId: string,
	params?: { name?: string; type?: string },
): Promise<DnsRecord[]> => {
	const records: DnsRecord[] = [];
	let page = 1;
	while (true) {
		const qs = new URLSearchParams();
		if (params?.name) qs.set("name", params.name);
		if (params?.type) qs.set("type", params.type);
		qs.set("per_page", "50");
		qs.set("page", String(page));
		const r = await cfFetch<DnsRecord[]>(
			token,
			"GET",
			`/zones/${zoneId}/dns_records?${qs.toString()}`,
		);
		records.push(...r.result);
		const total = r.result_info?.total_pages ?? 1;
		if (page >= total) break;
		page += 1;
	}
	return records;
};

export const getDnsRecord = async (
	token: string,
	zoneId: string,
	recordId: string,
): Promise<DnsRecord | null> => {
	try {
		const r = await cfFetch<DnsRecord>(
			token,
			"GET",
			`/zones/${zoneId}/dns_records/${recordId}`,
		);
		return r.result;
	} catch (err) {
		if (err instanceof CloudflareApiError && err.status === 404) {
			return null;
		}
		throw err;
	}
};

export const createDnsRecord = async (
	token: string,
	zoneId: string,
	input: {
		name: string;
		content: string;
		type?: "CNAME";
		proxied?: boolean;
		comment?: string;
	},
): Promise<DnsRecord> => {
	const r = await cfFetch<DnsRecord>(
		token,
		"POST",
		`/zones/${zoneId}/dns_records`,
		{
			type: input.type ?? "CNAME",
			name: input.name,
			content: input.content,
			proxied: input.proxied ?? true,
			comment: input.comment ?? "Managed by Dokploy",
			ttl: 1,
		},
	);
	return r.result;
};

export const deleteDnsRecord = async (
	token: string,
	zoneId: string,
	recordId: string,
): Promise<void> => {
	await cfFetch<unknown>(
		token,
		"DELETE",
		`/zones/${zoneId}/dns_records/${recordId}`,
	);
};

export const buildIngress = (opts: {
	hostnames: { hostname: string; service: string; path?: string }[];
}): IngressRule[] => {
	const rules: IngressRule[] = opts.hostnames.map((h) => ({
		hostname: h.hostname,
		...(h.path ? { path: h.path } : {}),
		service: h.service,
	}));
	rules.push({ service: "http_status:404" });
	return rules;
};
