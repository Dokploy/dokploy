/**
 * Can DoDomain deliver webhooks to this panel?
 *
 * DoDomain refuses to register (and dead-letters deliveries to) webhook URLs
 * that resolve to non-public addresses. A panel served on a Tailscale
 * `*.ts.net` name, a `.local` host or a private IP never receives them. These
 * helpers are pure on purpose: a hostname-only heuristic ("likely private"),
 * used to warn early, plus the parser of DoDomain's registration refusal.
 */

const PRIVATE_HOST_SUFFIXES = [
	".localhost",
	".local",
	".internal",
	".ts.net",
	".lan",
	".home.arpa",
] as const;

const parseIpv4 = (host: string): [number, number, number, number] | null => {
	const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
	if (!match) return null;
	const octets = match.slice(1).map(Number);
	if (octets.some((octet) => octet > 255)) return null;
	return octets as [number, number, number, number];
};

const isPrivateIpv4 = ([a, b]: [number, number, number, number]) =>
	a === 0 ||
	a === 10 ||
	a === 127 ||
	(a === 100 && b >= 64 && b <= 127) ||
	(a === 169 && b === 254) ||
	(a === 172 && b >= 16 && b <= 31) ||
	(a === 192 && b === 168);

/** `host` is a bare IPv6 literal (no brackets). */
const isPrivateIpv6 = (host: string) => {
	let normalized: string;
	try {
		// Lets the URL parser expand/compress the literal into one canonical form.
		normalized = new URL(`http://[${host}]`).hostname.slice(1, -1);
	} catch {
		return false;
	}
	if (normalized === "::1" || normalized === "::") return true;
	// IPv4-mapped (::ffff:a.b.c.d is canonicalised to ::ffff:xxxx:xxxx).
	const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
	if (mapped) {
		const high = Number.parseInt(mapped[1] as string, 16);
		const low = Number.parseInt(mapped[2] as string, 16);
		return isPrivateIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
	}
	const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
	if (!Number.isFinite(first)) return false;
	// fc00::/7 unique-local, fe80::/10 link-local.
	return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
};

const hostnameOf = (hostOrUrl: string) => {
	const value = hostOrUrl.trim();
	if (!value) return "";
	try {
		if (value.includes("://")) return new URL(value).hostname;
		// "host", "host:port", "[::1]:3000" or a bare IPv6 literal.
		if (value.startsWith("[") || (value.match(/:/g) ?? []).length > 1) {
			return new URL(`http://${value.startsWith("[") ? value : `[${value}]`}`)
				.hostname;
		}
		return new URL(`http://${value}`).hostname;
	} catch {
		return "";
	}
};

/**
 * True when a webhook sent to this host or URL almost certainly cannot be
 * delivered by a public service: localhost, `*.local`, `*.internal`,
 * `*.ts.net` (Tailscale, CGNAT 100.64/10), single-label names, and IPv4/IPv6
 * literals in private, loopback, link-local, CGNAT or unique-local ranges.
 * Hostname-only (no DNS lookup): DoDomain's own check stays the authority.
 */
export const isLikelyPrivateWebhookHost = (hostOrUrl: string): boolean => {
	const hostname = hostnameOf(hostOrUrl).toLowerCase().replace(/\.$/, "");
	if (!hostname) return false;
	if (hostname.startsWith("[") && hostname.endsWith("]")) {
		return isPrivateIpv6(hostname.slice(1, -1));
	}
	const ipv4 = parseIpv4(hostname);
	if (ipv4) return isPrivateIpv4(ipv4);
	if (hostname === "localhost") return true;
	if (PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
		return true;
	}
	// Not an IP and no dot: a bare intranet name no public resolver knows.
	return !hostname.includes(".");
};

/** `details.reason` values DoDomain uses when it refuses a webhook URL. */
export const DODOMAIN_WEBHOOK_REFUSAL_REASONS = [
	"webhook_url_resolves_private",
	// Tentative on DoDomain's side: the host does not resolve at all.
	"webhook_url_unresolvable",
] as const;

export type DoDomainWebhookRefusalReason =
	(typeof DODOMAIN_WEBHOOK_REFUSAL_REASONS)[number];

/**
 * Reads DoDomain's refusal to register a webhook URL:
 * HTTP 400 `{"error":"invalid_request","details":{"reason":"..."}}`.
 * Matches ONLY on `error` + `details.reason`, never on the human message, which
 * DoDomain may reword. Anything else (including an `invalid_request` without
 * a known reason, e.g. a non-https URL) returns null and is reported with
 * DoDomain's own message by the caller.
 */
export const parseDoDomainWebhookRefusal = (error: {
	status?: number;
	body?: unknown;
}): DoDomainWebhookRefusalReason | null => {
	if (error.status !== 400) return null;
	const body = error.body as {
		error?: unknown;
		details?: { reason?: unknown } | null;
	} | null;
	if (!body || typeof body !== "object") return null;
	if (body.error !== "invalid_request") return null;
	const reason = body.details?.reason;
	return DODOMAIN_WEBHOOK_REFUSAL_REASONS.find((r) => r === reason) ?? null;
};

const WEBHOOK_WARNING_TAIL =
	"DNS status still updates when you press Re-verify DNS. Serve the panel on a public HTTPS URL to receive webhooks.";

/** The readable warning for a private (or refused) webhook host. */
export const dodomainWebhookWarning = (
	host: string,
	reason: DoDomainWebhookRefusalReason = "webhook_url_resolves_private",
) =>
	reason === "webhook_url_unresolvable"
		? `DoDomain couldn't resolve ${host}, so domain-status webhooks won't arrive. ${WEBHOOK_WARNING_TAIL}`
		: `DoDomain can't reach ${host}, so domain-status webhooks won't arrive. ${WEBHOOK_WARNING_TAIL}`;
