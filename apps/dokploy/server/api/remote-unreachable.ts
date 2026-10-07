/**
 * Detects "the remote server could not be reached" failures.
 *
 * Remote servers are driven over SSH (dockerode over ssh2, or our own ssh2
 * exec helpers). When such a server is offline the failure surfaces as a raw
 * Node socket error such as `connect EHOSTUNREACH 31.57.34.138:22`. That is an
 * environment condition, not a Dokploy bug, so the tRPC layer turns it into a
 * clear, non-500 error instead of reporting it.
 *
 * This module is pure (no DB, no tRPC) so it can be unit tested on its own.
 */

/** Node system error codes that mean "the host did not accept our connection". */
export const REMOTE_UNREACHABLE_CODES = [
	"EHOSTUNREACH",
	"ENETUNREACH",
	"EHOSTDOWN",
	"ECONNREFUSED",
	"ETIMEDOUT",
	"ECONNRESET",
] as const;

/**
 * Extra codes that only count when the failure is already known to come from
 * our SSH layer (a DNS failure on the stored hostname of a remote server).
 */
const SSH_ONLY_CODES = ["ENOTFOUND", "EAI_AGAIN"] as const;

const UNREACHABLE_CODE_SET: ReadonlySet<string> = new Set(
	REMOTE_UNREACHABLE_CODES,
);

/** Prefix our ssh2 wrappers (execAsync.ts) put on client level failures. */
export const SSH_CONNECTION_ERROR_PREFIX = "SSH connection error:";

const DEFAULT_SSH_PORT = 22;

const SSH_HANDSHAKE_TIMEOUT = /timed out while waiting for handshake/i;
const SSH_ERROR_CODE = new RegExp(
	`\\b(${[...REMOTE_UNREACHABLE_CODES, ...SSH_ONLY_CODES].join("|")})\\b`,
);
// "connect EHOSTUNREACH 31.57.34.138:22", "connect ECONNREFUSED [::1]:22"
const CONNECT_TARGET = /\bconnect \w+ (\[[0-9a-f:.]+\]|[^\s:]+):(\d{1,5})\b/i;

const MAX_CAUSE_DEPTH = 8;

export interface RemoteUnreachable {
	/** Address of the remote server when the error carried one. */
	host?: string;
	port?: number;
	/** Node error code, or `ETIMEDOUT` for an SSH handshake timeout. */
	code: string;
	/** User-facing message. Contains host:port and the code, never a secret. */
	message: string;
}

export interface RemoteEndpoint {
	host: string;
	port: number;
}

export interface ClassifyOptions {
	/**
	 * Additional (host, port) pairs known to be a configured remote server's SSH
	 * endpoint. Port 22 is always accepted; any other port must be listed here
	 * (or be reported by an ssh2 wrapper) to avoid mislabelling an unrelated
	 * outbound connection failure.
	 */
	sshEndpoints?: readonly RemoteEndpoint[];
}

type ErrorLike = {
	code?: unknown;
	address?: unknown;
	port?: unknown;
	level?: unknown;
	message?: unknown;
	cause?: unknown;
	originalError?: unknown;
	context?: { originalError?: unknown } | null;
};

const asErrorLike = (value: unknown): ErrorLike | null =>
	value && typeof value === "object" ? (value as ErrorLike) : null;

/**
 * Every error reachable through `cause`, `originalError` (ExecError) and
 * `context.originalError` (WriteFileRemoteError), outermost first.
 */
const collectChain = (error: unknown): ErrorLike[] => {
	const chain: ErrorLike[] = [];
	const seen = new Set<unknown>();
	const queue: unknown[] = [error];
	while (queue.length > 0 && chain.length < MAX_CAUSE_DEPTH * 2) {
		const next = queue.shift();
		const node = asErrorLike(next);
		if (!node || seen.has(node)) continue;
		seen.add(node);
		chain.push(node);
		queue.push(node.cause, node.originalError, node.context?.originalError);
	}
	return chain;
};

const isRemoteHostAddress = (address: string) =>
	address.length > 0 && !address.includes("/") && !address.includes("\\");

const messageOf = (node: ErrorLike) =>
	typeof node.message === "string" ? node.message : "";

/**
 * A Node TCP connect failure to a remote address: `code` is a system error
 * code and the error carries a network `address` and numeric `port`. A unix
 * socket failure (the local docker socket) has a filesystem path as `address`
 * and no port, so it never matches.
 */
export const findTcpConnectFailure = (
	error: unknown,
): { code: string; host: string; port: number } | null => {
	for (const node of collectChain(error)) {
		if (
			typeof node.code === "string" &&
			UNREACHABLE_CODE_SET.has(node.code) &&
			typeof node.address === "string" &&
			isRemoteHostAddress(node.address) &&
			typeof node.port === "number" &&
			Number.isInteger(node.port)
		) {
			return { code: node.code, host: node.address, port: node.port };
		}
	}
	return null;
};

const isKnownSshEndpoint = (
	host: string,
	port: number,
	options: ClassifyOptions,
) =>
	port === DEFAULT_SSH_PORT ||
	(options.sshEndpoints ?? []).some((e) => e.host === host && e.port === port);

export const formatRemoteUnreachableMessage = (info: {
	host?: string;
	port?: number;
	code: string;
}) => {
	const target = info.host
		? `at ${info.host}${info.port ? `:${info.port}` : ""}`
		: "over SSH";
	return `Couldn't reach the server ${target} (${info.code}). Check that it is online and reachable over SSH.`;
};

/**
 * Returns details when `error` (or anything in its cause chain) is a failure
 * to reach a remote server over SSH, otherwise `null`.
 *
 * Mapped:
 *  - TCP connect failures to a remote address on the SSH port
 *  - ssh2 client timeouts ("Timed out while waiting for handshake")
 *  - our wrapped ssh2 errors ("SSH connection error: ...") whose reason is a
 *    network failure
 *
 * Not mapped: failures on the local docker socket, SSH authentication
 * failures, and anything else.
 */
export const classifyRemoteUnreachable = (
	error: unknown,
	options: ClassifyOptions = {},
): RemoteUnreachable | null => {
	const chain = collectChain(error);

	for (const node of chain) {
		if (
			typeof node.code === "string" &&
			UNREACHABLE_CODE_SET.has(node.code) &&
			typeof node.address === "string" &&
			isRemoteHostAddress(node.address) &&
			typeof node.port === "number" &&
			isKnownSshEndpoint(node.address, node.port, options)
		) {
			const info = { host: node.address, port: node.port, code: node.code };
			return { ...info, message: formatRemoteUnreachableMessage(info) };
		}
	}

	for (const node of chain) {
		const message = messageOf(node);
		const handshakeTimeout =
			node.level === "client-timeout" || SSH_HANDSHAKE_TIMEOUT.test(message);
		const wrappedSshError =
			message.startsWith(SSH_CONNECTION_ERROR_PREFIX) &&
			SSH_ERROR_CODE.test(message);
		if (!handshakeTimeout && !wrappedSshError) continue;

		const code = handshakeTimeout
			? "ETIMEDOUT"
			: (SSH_ERROR_CODE.exec(message)?.[1] as string);
		const target = CONNECT_TARGET.exec(message);
		const info = {
			host: target?.[1]?.replace(/^\[|\]$/g, ""),
			port: target?.[2] ? Number(target[2]) : undefined,
			code,
		};
		return { ...info, message: formatRemoteUnreachableMessage(info) };
	}

	return null;
};
