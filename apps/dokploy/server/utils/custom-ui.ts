import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import semver from "semver";

export const UI_MANIFEST_PATH = "/dokploy-ui.json";
const MANIFEST_TTL_MS = 30_000;
const MANIFEST_TIMEOUT_MS = 3_000;
const PROXY_IDLE_TIMEOUT_MS = 60_000;
// A UI that was compatible stays active through short network blips.
const FAILURES_BEFORE_FALLBACK = 3;

const HOP_BY_HOP_HEADERS = [
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"proxy-connection",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
];

// Mirrors the headers() block in next.config.mjs, which proxied responses skip.
const SECURITY_HEADERS: Record<string, string> = {
	"x-frame-options": "DENY",
	"x-content-type-options": "nosniff",
};
const DEFAULT_HEADERS: Record<string, string> = {
	"content-security-policy": "frame-ancestors 'none'",
	"referrer-policy": "strict-origin-when-cross-origin",
};

export type UiMode =
	| { kind: "default" }
	| { kind: "disabled" }
	| { kind: "custom"; target: URL };

export type UiManifest = {
	name: string;
	version: string;
	dokploy: string;
};

export type CompatibilityResult =
	| { ok: true; manifest: UiManifest }
	| { ok: false; reason: string; transient: boolean };

type RequestHandler = (
	req: IncomingMessage,
	res: ServerResponse,
) => void | Promise<void>;

type Logger = Pick<Console, "log" | "warn" | "error">;

export const resolveUiMode = (
	env: Record<string, string | undefined>,
	log: Logger = console,
): UiMode => {
	const uiUrl = env.DOKPLOY_UI_URL?.trim();
	if (uiUrl) {
		let target: URL;
		try {
			target = new URL(uiUrl);
		} catch {
			log.error(
				`DOKPLOY_UI_URL "${uiUrl}" is not a valid URL, serving the built-in UI`,
			);
			return { kind: "default" };
		}
		if (target.protocol !== "http:" && target.protocol !== "https:") {
			log.error(
				`DOKPLOY_UI_URL must use http or https, received "${target.protocol}", serving the built-in UI`,
			);
			return { kind: "default" };
		}
		target.search = "";
		target.hash = "";
		return { kind: "custom", target };
	}
	if (env.DOKPLOY_DISABLE_UI === "true") {
		return { kind: "disabled" };
	}
	return { kind: "default" };
};

// The URL parser normalizes "..", "%2e%2e" and duplicate dots, so a path
// such as "/api/../dashboard" is not treated as an API path.
// Returns null for request targets that cannot be parsed.
export const getPathname = (rawUrl: string | undefined): string | null => {
	try {
		return new URL(rawUrl ?? "/", "http://localhost").pathname;
	} catch {
		return null;
	}
};

export const isApiPath = (pathname: string) =>
	pathname === "/api" || pathname.startsWith("/api/");

export const checkManifest = (
	manifest: unknown,
	dokployVersion: string,
): CompatibilityResult => {
	const fail = (reason: string): CompatibilityResult => ({
		ok: false,
		reason,
		transient: false,
	});
	if (typeof manifest !== "object" || manifest === null) {
		return fail("manifest is not a JSON object");
	}
	const { name, version, dokploy } = manifest as Record<string, unknown>;
	if (typeof name !== "string" || typeof version !== "string") {
		return fail("manifest must have string name and version");
	}
	if (typeof dokploy !== "string" || semver.validRange(dokploy) === null) {
		return fail(
			`manifest field "dokploy" must be a semver range, received ${JSON.stringify(dokploy)}`,
		);
	}
	const current = semver.valid(dokployVersion);
	if (current === null) {
		return fail(`Dokploy version "${dokployVersion}" is not valid semver`);
	}
	if (!semver.satisfies(current, dokploy, { includePrerelease: true })) {
		return fail(
			`${name}@${version} supports Dokploy ${dokploy}, this is ${current}`,
		);
	}
	return { ok: true, manifest: { name, version, dokploy } };
};

const joinTargetPath = (target: URL, path: string) =>
	`${target.pathname.replace(/\/$/, "")}${path}`;

export const createCompatibilityCheck = ({
	target,
	dokployVersion,
	fetchImpl = fetch,
	now = Date.now,
	log = console,
}: {
	target: URL;
	dokployVersion: string;
	fetchImpl?: typeof fetch;
	now?: () => number;
	log?: Pick<Console, "log" | "warn">;
}) => {
	let current: CompatibilityResult | null = null;
	let checkedAt = 0;
	let consecutiveFailures = 0;
	let inflight: Promise<CompatibilityResult> | null = null;
	let lastReported: string | null = null;

	const manifestUrl = new URL(target);
	manifestUrl.pathname = joinTargetPath(target, UI_MANIFEST_PATH);

	const load = async (): Promise<CompatibilityResult> => {
		try {
			const response = await fetchImpl(manifestUrl, {
				signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
			});
			if (!response.ok) {
				return {
					ok: false,
					reason: `${manifestUrl.href} returned HTTP ${response.status}`,
					transient: response.status >= 500,
				};
			}
			const text = await response.text();
			let manifest: unknown;
			try {
				manifest = JSON.parse(text);
			} catch {
				return {
					ok: false,
					reason: `${manifestUrl.href} is not valid JSON`,
					transient: false,
				};
			}
			return checkManifest(manifest, dokployVersion);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				ok: false,
				reason: `cannot read ${manifestUrl.href}: ${message}`,
				transient: true,
			};
		}
	};

	const report = (result: CompatibilityResult) => {
		const key = result.ok
			? `ok:${result.manifest.name}@${result.manifest.version}`
			: `fail:${result.reason}`;
		if (key === lastReported) return;
		lastReported = key;
		if (result.ok) {
			log.log(
				`Custom UI ${result.manifest.name}@${result.manifest.version} is active (supports Dokploy ${result.manifest.dokploy})`,
			);
		} else {
			log.warn(
				`Custom UI is not used, serving the built-in UI: ${result.reason}`,
			);
		}
	};

	const apply = (result: CompatibilityResult) => {
		checkedAt = now();
		if (result.ok || !result.transient) {
			consecutiveFailures = 0;
			current = result;
		} else {
			consecutiveFailures += 1;
			const keepActiveUi =
				current?.ok === true && consecutiveFailures < FAILURES_BEFORE_FALLBACK;
			if (keepActiveUi) {
				log.warn(
					`Custom UI check failed (${consecutiveFailures}/${FAILURES_BEFORE_FALLBACK}), keeping it active: ${result.reason}`,
				);
			} else {
				current = result;
			}
		}
		const settled = current ?? result;
		report(settled);
		return settled;
	};

	const refresh = () => {
		if (!inflight) {
			inflight = load()
				.then(apply)
				.finally(() => {
					inflight = null;
				});
		}
		return inflight;
	};

	// Stale-while-revalidate: only the first request waits for the manifest.
	const check = (): Promise<CompatibilityResult> => {
		if (current === null) {
			return refresh();
		}
		if (now() - checkedAt >= MANIFEST_TTL_MS) {
			refresh().catch(() => undefined);
		}
		return Promise.resolve(current);
	};

	// Makes the next check revalidate, e.g. after the proxy cannot connect.
	const invalidate = () => {
		checkedAt = 0;
	};

	return Object.assign(check, { invalidate });
};

export type CompatibilityCheck = (() => Promise<CompatibilityResult>) & {
	invalidate?: () => void;
};

const connectionTokens = (headers: http.IncomingHttpHeaders) =>
	(headers.connection ?? "")
		.split(",")
		.map((token) => token.trim().toLowerCase())
		.filter(Boolean);

const cleanHeaders = (
	headers: http.IncomingHttpHeaders,
): http.OutgoingHttpHeaders => {
	const result: http.OutgoingHttpHeaders = {};
	const dropped = new Set([
		...HOP_BY_HOP_HEADERS,
		...connectionTokens(headers),
	]);
	for (const [name, value] of Object.entries(headers)) {
		if (value !== undefined && !dropped.has(name)) {
			result[name] = value;
		}
	}
	return result;
};

const withSecurityHeaders = (
	headers: http.OutgoingHttpHeaders,
): http.OutgoingHttpHeaders => {
	const result: http.OutgoingHttpHeaders = { ...headers };
	for (const [name, value] of Object.entries(DEFAULT_HEADERS)) {
		if (result[name] === undefined) {
			result[name] = value;
		}
	}
	return { ...result, ...SECURITY_HEADERS };
};

// A GET or HEAD request without a body can be answered again by the built-in
// UI, because the proxy never reads its stream.
const isReplayable = (req: IncomingMessage) =>
	(req.method === "GET" || req.method === "HEAD") &&
	!req.headers["transfer-encoding"] &&
	Number(req.headers["content-length"] ?? 0) === 0;

export type ProxyFailure = "unreachable" | "server-error" | "missing-asset";

// onFailure runs when the custom UI cannot answer: it is unreachable, it
// returns a 5xx, or it has no file for a /_next/ asset (for example a script
// of a built-in page that was served as a fallback). It returns true when it
// has answered the request itself, which is possible only for replayable
// requests.
export const proxyRequest = (
	req: IncomingMessage,
	res: ServerResponse,
	target: URL,
	onFailure?: (failure: ProxyFailure, replayable: boolean) => boolean,
) => {
	let clientGone = false;
	const replayable = isReplayable(req);
	const isNextAsset = (getPathname(req.url) ?? "").startsWith("/_next/");
	const client = target.protocol === "https:" ? https : http;
	const forwardedFor = [
		req.headers["x-forwarded-for"],
		req.socket.remoteAddress,
	]
		.filter(Boolean)
		.join(", ");

	const headers: http.OutgoingHttpHeaders = {
		...cleanHeaders(req.headers),
		host: target.host,
		"x-forwarded-proto": req.headers["x-forwarded-proto"] ?? "http",
		"x-forwarded-for": forwardedFor,
	};
	if (req.headers.host) {
		headers["x-forwarded-host"] = req.headers.host;
	} else {
		delete headers["x-forwarded-host"];
	}

	const upstream = client.request({
		protocol: target.protocol,
		// URL keeps IPv6 addresses in brackets; http.request expects them bare.
		hostname: target.hostname.replace(/^\[|\]$/g, ""),
		port: target.port || undefined,
		method: req.method,
		path: joinTargetPath(target, req.url ?? "/"),
		headers,
		timeout: PROXY_IDLE_TIMEOUT_MS,
	});

	upstream.on("response", (upstreamRes) => {
		// The timeout guards the connection phase only, so slow streams survive.
		upstream.setTimeout(0);
		const status = upstreamRes.statusCode ?? 502;
		const failure: ProxyFailure | null =
			status >= 500
				? "server-error"
				: status === 404 && isNextAsset
					? "missing-asset"
					: null;
		if (failure && !clientGone && onFailure?.(failure, replayable)) {
			upstreamRes.resume();
			return;
		}
		upstreamRes.on("error", () => res.destroy());
		upstreamRes.on("aborted", () => res.destroy());
		res.writeHead(
			status,
			withSecurityHeaders(cleanHeaders(upstreamRes.headers)),
		);
		upstreamRes.pipe(res);
	});

	upstream.on("timeout", () => {
		upstream.destroy(new Error("custom UI did not respond in time"));
	});

	upstream.on("error", (error) => {
		if (clientGone) return;
		console.error("Custom UI proxy error:", error.message);
		if (res.headersSent) {
			res.destroy();
			return;
		}
		if (onFailure?.("unreachable", replayable)) return;
		res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
		res.end("The custom UI is not reachable.");
	});

	res.on("close", () => {
		if (!res.writableFinished) {
			clientGone = true;
			upstream.destroy();
		}
	});

	if (replayable) {
		upstream.end();
	} else {
		req.pipe(upstream);
	}
};

const sendText = (res: ServerResponse, status: number, text: string) => {
	if (res.headersSent) {
		res.destroy();
		return;
	}
	res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
	res.end(text);
};

export const createUiRequestHandler = ({
	mode,
	handleNext,
	checkCompatibility,
}: {
	mode: UiMode;
	handleNext: RequestHandler;
	checkCompatibility?: CompatibilityCheck;
}): RequestHandler => {
	const serveBuiltInUi = (req: IncomingMessage, res: ServerResponse) => {
		Promise.resolve(handleNext(req, res)).catch((error) => {
			console.error("UI request handler error:", error);
			sendText(res, 500, "Internal server error.");
		});
	};
	if (mode.kind === "default") {
		return handleNext;
	}
	return async (req, res) => {
		try {
			const pathname = getPathname(req.url);
			if (pathname === null) {
				sendText(res, 400, "Bad request.");
				return;
			}
			if (isApiPath(pathname)) {
				await handleNext(req, res);
				return;
			}
			if (mode.kind === "disabled") {
				sendText(
					res,
					404,
					"The Dokploy UI is disabled. The API is available under /api.",
				);
				return;
			}
			const compatibility = checkCompatibility
				? await checkCompatibility()
				: null;
			if (res.destroyed || req.socket.destroyed) return;
			if (!compatibility?.ok) {
				await handleNext(req, res);
				return;
			}
			proxyRequest(req, res, mode.target, (failure, replayable) => {
				if (failure !== "missing-asset") {
					checkCompatibility?.invalidate?.();
				}
				if (!replayable) return false;
				serveBuiltInUi(req, res);
				return true;
			});
		} catch (error) {
			console.error("UI request handler error:", error);
			sendText(res, 500, "Internal server error.");
		}
	};
};
