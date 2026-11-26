import type { IncomingHttpHeaders } from "node:http";
import { IS_CLOUD } from "@dokploy/server/constants";

export type AuditStreamSource = "trpc" | "domain" | "auth" | "wss" | "http";

export interface AuditStreamEvent {
	source: AuditStreamSource;
	path?: string;
	type?: string;
	ok?: boolean;
	errorCode?: string;
	durationMs?: number;
	action?: string;
	resourceType?: string;
	resourceId?: string;
	resourceName?: string;
	userId?: string | null;
	userEmail?: string | null;
	userRole?: string | null;
	organizationId?: string | null;
	sessionId?: string | null;
	impersonatedBy?: string | null;
	authMethod?: "session" | "apiKey" | "anonymous";
	apiKeyId?: string | null;
	ip?: string | null;
	forwardedFor?: string | null;
	userAgent?: string | null;
	requestId?: string;
	input?: unknown;
	metadata?: unknown;
}

// Cloud only: these lines are shipped from the container stdout to ClickHouse by Vector.
export const isAuditStreamEnabled = () => IS_CLOUD;

export const emitAuditEvent = (event: AuditStreamEvent) => {
	if (!IS_CLOUD) return;
	try {
		process.stdout.write(
			`${JSON.stringify({
				log_type: "dokploy.audit",
				ts: new Date().toISOString(),
				...event,
			})}\n`,
		);
	} catch (error) {
		console.error("[audit-stream] Failed to emit audit event:", error);
	}
};

const SECRET_KEY =
	/pass(word|phrase)?|secret|token|api[-_]?key|key$|authorization|cookie|credential|webhook_?url|connection_?string|dsn|otp|backup_?codes|build_?args|env$|env_?(variables|vars)|compose_?file|docker_?compose|traefik_?config|additional_?flags|extra_?config|^content$|^headers$|^code$/i;
const ID_KEY = /Ids?$/;
// Custom webhook endpoints often embed the token in the path (/services/T/B/XXX).
const ORIGIN_ONLY_KEY = /endpoint$/i;
const COMMAND_KEY = /^(cmd|command)$/i;
const MAX_STRING_LENGTH = 2048;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

// Git URLs and webhook endpoints can carry user:token@ or ?token=.
const redactUrl = (value: string) => {
	if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
	try {
		const url = new URL(value);
		if (!url.username && !url.password && !url.search) return value;
		const credentials = url.username || url.password ? "[redacted]@" : "";
		const query = url.search ? "?[redacted]" : "";
		return `${url.protocol}//${credentials}${url.host}${url.pathname}${query}`;
	} catch {
		return value;
	}
};

const urlOrigin = (value: string) => {
	try {
		const url = new URL(value);
		return url.pathname === "/" && !url.search && !url.username
			? value
			: `${url.protocol}//${url.host}/[redacted]`;
	} catch {
		return "[redacted]";
	}
};

const isSecretKey = (key: string) => SECRET_KEY.test(key) && !ID_KEY.test(key);

// A shell word: any run of quoted strings, escapes and plain characters.
const SHELL_VALUE = String.raw`((?:"(?:\\.|[^"\\])*"|\$?'[^']*'|\\.|[^\s;|&"'])+)`;
const SECRET_HEADER = String.raw`[\w-]*(?:[Kk]ey|KEY|[Tt]oken|TOKEN|[Ss]ecret|SECRET|[Aa]uth|AUTH|[Cc]ookie|COOKIE|[Ss]ession|SESSION)[\w-]*:`;
const HEADER_FLAG = String.raw`(?:^|\s)(?:-H|--header)(?:\s+|=)?`;

// Short flags like -p/-a only mean "password" for specific clients (ssh -p is a port).
const clientFlag = (clients: string, flag: string, separator: string) =>
	new RegExp(
		String.raw`((?:^|[;&|(]\s*)(?:sudo\s+)?(?:${clients})\b(?:"[^"]*"|'[^']*'|[^|;&\n"'])*?\s${flag}${separator})(?!-)${SHELL_VALUE}`,
		"g",
	);

const COMMAND_SECRETS: Array<[RegExp, string]> = [
	[
		new RegExp(
			String.raw`(${HEADER_FLAG}(["'])${SECRET_HEADER}\s*)(?:(?!\2).)*`,
			"g",
		),
		"$1[redacted]",
	],
	[
		new RegExp(String.raw`(${HEADER_FLAG}${SECRET_HEADER})[^\s;|&]+`, "g"),
		"$1[redacted]",
	],
	[
		/\b(authorization:\s*)?(bearer|basic|token)\s+[^\s'";|&]+/gi,
		"$1$2 [redacted]",
	],
	[
		new RegExp(
			String.raw`(--?[\w-]*(?:pass(?:word)?|secret|token|key|auth(?!entication))[\w-]*[=\s]+)${SHELL_VALUE}`,
			"gi",
		),
		"$1[redacted]",
	],
	[
		new RegExp(
			String.raw`\b(\w*(?:PASS(?:WORD)?|SECRET|TOKEN|KEY|AUTH)\w*=)${SHELL_VALUE}`,
			"gi",
		),
		"$1[redacted]",
	],
	[/(\w+:\/\/)[^/\s@]+@/g, "$1[redacted]@"],
	[
		/((?:^|\s)(?:-u|-U|--user|--proxy-user)(?:\s+|=)?)("[^"]*:[^"]*"|'[^']*:[^']*'|[^\s"']*:[^\s"']*)/g,
		"$1[redacted]",
	],
	[
		clientFlag("mysql|mariadb|mysqldump|mariadb-dump|mysqladmin", "-p", ""),
		"$1[redacted]",
	],
	[
		clientFlag(
			"mongo|mongosh|mongodump|mongorestore|mongoexport|mongoimport|sshpass|docker\\s+login",
			"-p",
			String.raw`\s*`,
		),
		"$1[redacted]",
	],
	[
		clientFlag("redis-cli|valkey-cli|keydb-cli", "-a", String.raw`\s+`),
		"$1[redacted]",
	],
	[clientFlag("curl", "-b", String.raw`\s*`), "$1[redacted]"],
	[clientFlag("curl", "--cookie", String.raw`(?:\s+|=)`), "$1[redacted]"],
];

// Shell commands carry secrets inline (headers, flags, VAR=value, user:pass@ URLs).
export const redactCommand = (command: string) =>
	COMMAND_SECRETS.reduce(
		(text, [pattern, replacement]) => text.replace(pattern, replacement),
		command,
	);

export const redactAuditValue = (
	value: unknown,
	key = "",
	depth = 0,
): unknown => {
	if (key && isSecretKey(key)) {
		return value === null || value === undefined || value === ""
			? value
			: "[redacted]";
	}
	if (typeof value === "string" && key && ORIGIN_ONLY_KEY.test(key)) {
		return urlOrigin(value);
	}
	if (typeof value === "string") {
		const text = key && COMMAND_KEY.test(key) ? redactCommand(value) : value;
		if (text.includes("-----BEGIN")) return "[redacted]";
		if (text.length > MAX_STRING_LENGTH) return `[${text.length} chars]`;
		return redactUrl(text);
	}
	if (value === null || typeof value !== "object") return value;
	if (depth >= MAX_DEPTH) return "[too deep]";
	if (value instanceof Date) return value.toISOString();
	if (value instanceof Blob) {
		return {
			name: value instanceof File ? value.name : undefined,
			size: value.size,
		};
	}
	if (ArrayBuffer.isView(value)) return `[${value.byteLength} bytes]`;
	if (value instanceof FormData) {
		return redactAuditValue(Object.fromEntries(value.entries()), key, depth);
	}
	if (Array.isArray(value)) {
		return value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => redactAuditValue(item, "", depth + 1));
	}
	return Object.fromEntries(
		Object.entries(value).map(([k, v]) => [
			k,
			redactAuditValue(v, k, depth + 1),
		]),
	);
};

type HeaderSource = Headers | IncomingHttpHeaders | undefined | null;

const readHeader = (headers: HeaderSource, name: string) => {
	if (!headers) return undefined;
	const value =
		typeof (headers as Headers).get === "function"
			? (headers as Headers).get(name)
			: (headers as IncomingHttpHeaders)[name];
	return (Array.isArray(value) ? value[0] : value) || undefined;
};

// Cloud sits behind Cloudflare and Traefik rewrites X-Forwarded-For to the Swarm ingress IP.
export const requestNetworkFields = (
	headers: HeaderSource,
	remoteAddress?: string,
) => {
	const forwardedFor = readHeader(headers, "x-forwarded-for");
	return {
		ip:
			readHeader(headers, "cf-connecting-ip") ||
			forwardedFor?.split(",")[0]?.trim() ||
			remoteAddress ||
			null,
		forwardedFor: forwardedFor ?? null,
		userAgent: readHeader(headers, "user-agent") ?? null,
	};
};

interface AuditActorSession {
	id?: string;
	activeOrganizationId?: string | null;
	impersonatedBy?: string | null;
	apiKeyId?: string;
}

interface AuditActorUser {
	id: string;
	email?: string;
	role?: string;
}

export const requestAuditFields = (
	req:
		| { headers: IncomingHttpHeaders; socket?: { remoteAddress?: string } }
		| undefined,
	session: AuditActorSession | null | undefined,
	user: AuditActorUser | null | undefined,
): Partial<AuditStreamEvent> => ({
	userId: user?.id ?? null,
	userEmail: user?.email ?? null,
	userRole: user?.role ?? null,
	organizationId: session?.activeOrganizationId || null,
	sessionId: session?.id ?? null,
	impersonatedBy: session?.impersonatedBy ?? null,
	authMethod: session?.apiKeyId ? "apiKey" : session ? "session" : "anonymous",
	apiKeyId: session?.apiKeyId ?? null,
	...requestNetworkFields(req?.headers, req?.socket?.remoteAddress),
});
