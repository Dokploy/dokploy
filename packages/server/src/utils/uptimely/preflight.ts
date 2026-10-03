import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

/**
 * Preflight: "will Uptimely see this URL as up?". Uptimely's monitor-create
 * tool has no accepted-status-code option, so a Website monitor on a URL that
 * answers 404 (typical for APIs at `/`) is Offline from its first check.
 * This does the same plain GET up front so the dashboard can say so before
 * any monitor exists.
 */

export const PREFLIGHT_TIMEOUT_MS = 5_000;
export const PREFLIGHT_MAX_REDIRECTS = 5;
export const PREFLIGHT_USER_AGENT = "Dokploy-Uptimely-Preflight";
/** Upper bound on URLs probed per request (one per HTTPS domain). */
export const PREFLIGHT_MAX_URLS = 20;

export interface UptimelyPreflightResult {
	url: string;
	/** Final HTTP status after redirects, null when no response arrived. */
	status: number | null;
	/** True for a 2xx/3xx answer (what Uptimely treats as up). */
	ok: boolean;
	error?: string;
}

export interface CheckUrlOptions {
	timeoutMs?: number;
	maxRedirects?: number;
	/**
	 * Called with the URL of every hop (the first one included) before it is
	 * requested; throw to refuse it. This is where the https-only / public-host
	 * policy plugs in, so the raw network function stays testable on
	 * `http://127.0.0.1`.
	 */
	validateUrl?: (url: URL) => void | Promise<void>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const describeError = (error: unknown, timeoutMs: number) => {
	if (error instanceof Error) {
		if (error.name === "TimeoutError" || error.name === "AbortError") {
			return `Timed out after ${Math.round(timeoutMs / 1000)}s`;
		}
		const cause = (error as { cause?: { code?: string; message?: string } })
			.cause;
		if (cause?.code === "ENOTFOUND") return "Host not found (DNS)";
		if (cause?.code === "ECONNREFUSED") return "Connection refused";
		if (cause?.code?.startsWith("CERT_") || cause?.code?.includes("SSL")) {
			return `TLS error (${cause.code})`;
		}
		return cause?.message || cause?.code || error.message;
	}
	return "Request failed";
};

/**
 * One real GET of `url` (redirects followed, hop by hop, up to
 * `maxRedirects`). The body is never read: the stream is cancelled as soon
 * as the status line and headers are in. Never throws.
 */
export const checkUrl = async (
	url: string,
	options: CheckUrlOptions = {},
): Promise<UptimelyPreflightResult> => {
	const timeoutMs = options.timeoutMs ?? PREFLIGHT_TIMEOUT_MS;
	const maxRedirects = options.maxRedirects ?? PREFLIGHT_MAX_REDIRECTS;
	// One deadline for the whole chain, not per hop.
	const signal = AbortSignal.timeout(timeoutMs);
	try {
		let current = new URL(url);
		for (let hop = 0; ; hop++) {
			await options.validateUrl?.(current);
			const response = await fetch(current, {
				method: "GET",
				redirect: "manual",
				signal,
				headers: {
					"User-Agent": PREFLIGHT_USER_AGENT,
					Accept: "*/*",
				},
			});
			// Discard the body without downloading it.
			await response.body?.cancel().catch(() => {});
			const location = response.headers.get("location");
			if (REDIRECT_STATUSES.has(response.status) && location) {
				if (hop >= maxRedirects) {
					return {
						url,
						status: response.status,
						ok: false,
						error: `More than ${maxRedirects} redirects`,
					};
				}
				current = new URL(location, current);
				continue;
			}
			return {
				url,
				status: response.status,
				ok: response.status >= 200 && response.status < 400,
			};
		}
	} catch (error) {
		return {
			url,
			status: null,
			ok: false,
			error: describeError(error, timeoutMs),
		};
	}
};

// ---------------------------------------------------------------------------
// SSRF policy
// ---------------------------------------------------------------------------

const ipv4Parts = (ip: string) => ip.split(".").map(Number) as [
	number,
	number,
	number,
	number,
];

const isPrivateIPv4 = (ip: string) => {
	const [a, b, c] = ipv4Parts(ip);
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 0 && c === 0) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
};

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export const isNonPublicIp = (ip: string): boolean => {
	if (isIPv4(ip)) return isPrivateIPv4(ip);
	if (!isIPv6(ip)) return true;
	const lower = ip.toLowerCase();
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
	if (mapped) return isPrivateIPv4(mapped[1] as string);
	// URL normalizes ::ffff:127.0.0.1 to its hex form ::ffff:7f00:1.
	const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
	if (mappedHex) {
		const high = Number.parseInt(mappedHex[1] as string, 16);
		const low = Number.parseInt(mappedHex[2] as string, 16);
		return isPrivateIPv4(
			`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
		);
	}
	if (lower === "::" || lower === "::1") return true;
	// fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast.
	return /^(f[cd]|fe[89ab]|ff)/.test(lower);
};

type HostLookup = (
	hostname: string,
) => Promise<{ address: string; family: number }[]>;

const defaultLookup: HostLookup = (hostname) =>
	lookup(hostname, { all: true });

/**
 * The policy applied to every hop of a service preflight: HTTPS only, no
 * credentials or custom port in the URL, and a host that resolves only to
 * public addresses (so a domain pointed at 127.0.0.1 or the cloud metadata IP
 * cannot be used to probe the Dokploy host's network). Resolution happens
 * here and again inside fetch, so a DNS-rebinding race is narrowed, not
 * eliminated.
 */
export const assertPublicHttpsUrl = async (
	url: URL,
	resolveHost: HostLookup = defaultLookup,
) => {
	if (url.protocol !== "https:") {
		throw new Error("Only https:// URLs are checked");
	}
	if (url.username || url.password) {
		throw new Error("URLs with credentials are not checked");
	}
	if (url.port && url.port !== "443") {
		throw new Error("Only the default HTTPS port is checked");
	}
	// URL keeps IPv6 literals in brackets.
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	if (isIPv4(hostname) || isIPv6(hostname)) {
		if (isNonPublicIp(hostname)) {
			throw new Error("Private and loopback addresses are not checked");
		}
		return;
	}
	if (hostname === "localhost" || hostname.endsWith(".localhost")) {
		throw new Error("Private and loopback addresses are not checked");
	}
	const addresses = await resolveHost(hostname).catch(() => {
		throw new Error("Host not found (DNS)");
	});
	if (addresses.length === 0 || addresses.some((a) => isNonPublicIp(a.address))) {
		throw new Error("Private and loopback addresses are not checked");
	}
};

/**
 * Preflights a list of URLs under the public-HTTPS policy. Callers pass only
 * URLs derived from the service's own domains; anything else is refused by
 * the policy per hop, so this is also safe against a stray redirect.
 */
export const preflightUrls = async (
	urls: string[],
	options: { resolveHost?: HostLookup; timeoutMs?: number } = {},
): Promise<UptimelyPreflightResult[]> =>
	Promise.all(
		urls.slice(0, PREFLIGHT_MAX_URLS).map((url) =>
			checkUrl(url, {
				timeoutMs: options.timeoutMs,
				validateUrl: (u) => assertPublicHttpsUrl(u, options.resolveHost),
			}),
		),
	);
