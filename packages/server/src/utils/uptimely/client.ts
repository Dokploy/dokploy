/**
 * Minimal Uptimely MCP client.
 *
 * Uptimely has no REST API; its only programmatic surface is the MCP endpoint
 * at `<baseUrl>/api/mcp` (Streamable HTTP, stateless). A project API key is
 * accepted as `Authorization: Bearer <key>`. This client speaks just enough
 * JSON-RPC for Dokploy's needs (`initialize` + `tools/call`) so the fork does
 * not take a dependency on the MCP SDK.
 *
 * The server runs in "Code Mode": it lists only `search_tools` and
 * `execute_typescript`. `callTool("uptimely_x", args)` keeps its old signature
 * but is implemented as one `execute_typescript` call whose program invokes
 * `external_uptimely_x(args)` in the Uptimely sandbox.
 */

export const UPTIMELY_MCP_PROTOCOL_VERSION = "2025-03-26";
export const UPTIMELY_REQUEST_TIMEOUT_MS = 15_000;

export class UptimelyError extends Error {
	/** Uptimely denial code (e.g. AI_WRITE_OPS_DISABLED) or JSON-RPC code. */
	readonly code?: string | number;
	/** Deep link to the Uptimely setting that fixes a denial, when provided. */
	readonly settingsUrl?: string;

	constructor(
		message: string,
		options: { code?: string | number; settingsUrl?: string } = {},
	) {
		super(message);
		this.name = "UptimelyError";
		this.code = options.code;
		this.settingsUrl = options.settingsUrl;
	}
}

export interface UptimelyClientOptions {
	baseUrl: string;
	apiKey: string;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

interface JsonRpcResponse {
	jsonrpc?: string;
	id?: number | string | null;
	result?: unknown;
	error?: { code?: number; message?: string; data?: unknown };
}

interface ToolCallResult {
	isError?: boolean;
	content?: { type?: string; text?: string }[];
	structuredContent?: unknown;
}

export const uptimelyMcpUrl = (baseUrl: string) =>
	`${baseUrl.replace(/\/+$/, "")}/api/mcp`;

/**
 * Parses an SSE body (`event: message` / `data: {...}` frames separated by a
 * blank line) into the JSON payloads it carries. Multi-line `data:` fields are
 * joined with a newline, as the SSE spec requires.
 */
export const parseSseMessages = (body: string): unknown[] => {
	const messages: unknown[] = [];
	for (const frame of body.split(/\r?\n\r?\n/)) {
		const data = frame
			.split(/\r?\n/)
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).replace(/^ /, ""))
			.join("\n");
		if (!data.trim()) continue;
		try {
			messages.push(JSON.parse(data));
		} catch {
			// Ignore non-JSON frames (keep-alives, comments).
		}
	}
	return messages;
};

/**
 * Extracts the JSON-RPC response for `id` from a response body that is either
 * plain JSON (a single object or a batch array) or an SSE stream.
 */
export const parseJsonRpcBody = (
	body: string,
	contentType: string | null,
	id: number,
): JsonRpcResponse | null => {
	let candidates: unknown[];
	if (contentType?.includes("text/event-stream")) {
		candidates = parseSseMessages(body);
	} else {
		const trimmed = body.trim();
		if (!trimmed) return null;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			// Some proxies drop the content-type; fall back to SSE framing.
			candidates = parseSseMessages(body);
			return pickResponse(candidates, id);
		}
		candidates = Array.isArray(parsed) ? parsed : [parsed];
	}
	return pickResponse(candidates, id);
};

const pickResponse = (
	candidates: unknown[],
	id: number,
): JsonRpcResponse | null => {
	const responses = candidates.filter(
		(c): c is JsonRpcResponse =>
			!!c &&
			typeof c === "object" &&
			("result" in c ||
				// A string `error` is an OAuth-style body, not a JSON-RPC error.
				("error" in c &&
					!!(c as { error: unknown }).error &&
					typeof (c as { error: unknown }).error === "object")),
	);
	return (
		responses.find((r) => r.id === id) ??
		// A server error before the request id is known is reported with id null.
		responses.find((r) => r.id === null || r.id === undefined) ??
		null
	);
};

const readDenial = (result: ToolCallResult) => {
	const structured =
		result.structuredContent && typeof result.structuredContent === "object"
			? (result.structuredContent as Record<string, unknown>)
			: null;
	let parsedText: Record<string, unknown> | null = null;
	const text = result.content?.find((c) => typeof c.text === "string")?.text;
	if (!structured && text) {
		try {
			const value = JSON.parse(text);
			if (value && typeof value === "object") parsedText = value;
		} catch {
			parsedText = { message: text };
		}
	}
	const source = structured ?? parsedText ?? {};
	const message =
		typeof source.message === "string" && source.message
			? source.message
			: typeof source.error === "string" && source.error
				? source.error
				: "Uptimely returned an error";
	return new UptimelyError(message, {
		code: typeof source.code === "string" ? source.code : undefined,
		settingsUrl:
			typeof source.settingsUrl === "string" ? source.settingsUrl : undefined,
	});
};

// ---------------------------------------------------------------------------
// Code Mode
//
// Uptimely's MCP server exposes exactly two tools: `search_tools` and
// `execute_typescript`. The real tools (`uptimely_project_list`, ...) are only
// reachable as `external_<name>(input)` functions inside a TypeScript program
// run by `execute_typescript`. Every operation below is therefore one
// `execute_typescript` call with a tiny generated program.
// ---------------------------------------------------------------------------

export const UPTIMELY_EXECUTE_TOOL = "execute_typescript";

const TOOL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Builds the sandbox program that calls one Uptimely tool.
 *
 * The arguments are embedded as a single string literal (the JSON text of the
 * arguments, JSON-encoded again) and revived with `JSON.parse` in the sandbox.
 * User-supplied values therefore can never terminate the literal or become
 * code, and keys such as `__proto__` stay plain data. The tool name is checked
 * against a strict identifier pattern because it is the only part spliced in
 * as code.
 */
export const buildCodeModeProgram = (
	toolName: string,
	args: Record<string, unknown> = {},
): string => {
	if (!TOOL_NAME_PATTERN.test(toolName)) {
		throw new UptimelyError(`Invalid Uptimely tool name "${toolName}"`, {
			code: "INVALID_TOOL_NAME",
		});
	}
	const fn = toolName.startsWith("external_")
		? toolName
		: `external_${toolName}`;
	const literal = JSON.stringify(JSON.stringify(args ?? {}))
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
	return `const input = JSON.parse(${literal});\nreturn await ${fn}(input);`;
};

export interface ParsedSandboxError {
	code?: string;
	message: string;
	settingsUrl?: string;
	fields?: Record<string, unknown>;
}

const SANDBOX_ERROR_PATTERN = /^([A-Z][A-Z0-9_]*[A-Z0-9]):\s*([\s\S]*)$/;

/**
 * Splits `"<CODE>: <details> {json}"` (the shape of a denied `external_*`
 * call) into its parts. The trailing JSON carries the denial's structured
 * fields (for example `{"settingsUrl":"..."}`).
 */
export const parseSandboxError = (raw: string): ParsedSandboxError => {
	const text = raw.trim();
	const referenceError = /'?(external_[A-Za-z0-9_]+)'? is not defined/.exec(
		text,
	);
	if (referenceError) {
		return {
			code: "TOOL_UNAVAILABLE",
			message: `Uptimely does not expose ${referenceError[1]?.replace(/^external_/, "")} to this API key. Check the key's scopes in Uptimely.`,
		};
	}
	const match = SANDBOX_ERROR_PATTERN.exec(text);
	if (!match) return { message: text || "Uptimely returned an error" };
	const code = match[1] as string;
	let details = (match[2] ?? "").trim();
	let fields: Record<string, unknown> | undefined;
	for (
		let i = details.indexOf("{");
		i !== -1;
		i = details.indexOf("{", i + 1)
	) {
		const before = details.slice(0, i).trimEnd();
		if (before.endsWith(":")) continue; // e.g. "Provided arguments: {...}"
		try {
			const value = JSON.parse(details.slice(i));
			if (
				value &&
				typeof value === "object" &&
				!Array.isArray(value) &&
				Object.keys(value).length > 0
			) {
				fields = value as Record<string, unknown>;
				details = before;
				break;
			}
		} catch {
			// Not the trailing JSON; keep scanning.
		}
	}
	return {
		code,
		message: details || code,
		settingsUrl:
			typeof fields?.settingsUrl === "string" ? fields.settingsUrl : undefined,
		fields,
	};
};

interface ExecuteEnvelope {
	success?: boolean;
	result?: unknown;
	logs?: unknown;
	error?: { message?: string; name?: string } | string;
}

const readEnvelope = (result: ToolCallResult): ExecuteEnvelope => {
	const structured = result.structuredContent;
	if (structured && typeof structured === "object" && "success" in structured) {
		return structured as ExecuteEnvelope;
	}
	const text = result.content?.find((c) => typeof c.text === "string")?.text;
	if (text === undefined) {
		throw new UptimelyError("Uptimely returned an empty tool result");
	}
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new UptimelyError("Uptimely returned a non-JSON tool result");
	}
	if (!value || typeof value !== "object" || !("success" in value)) {
		throw new UptimelyError("Uptimely returned an unexpected tool result");
	}
	return value as ExecuteEnvelope;
};

/**
 * Unwraps the `tools/call` result of `execute_typescript`
 * (`{ success, result, logs }` or `{ success: false, logs, error }`) into the
 * program's return value, mapping sandbox errors to `UptimelyError`.
 */
export const unwrapCodeModeResult = <T>(raw: unknown): T => {
	const result = (raw ?? {}) as ToolCallResult;
	if (result.isError) {
		throw readDenial(result);
	}
	const envelope = readEnvelope(result);
	if (envelope.success !== true) {
		const failure = envelope.error;
		const message =
			typeof failure === "string"
				? failure
				: typeof failure?.message === "string"
					? failure.message
					: "";
		const parsed = parseSandboxError(message);
		throw new UptimelyError(parsed.message, {
			code: parsed.code,
			settingsUrl: parsed.settingsUrl,
		});
	}
	const value = envelope.result;
	if (value === undefined || value === null) {
		throw new UptimelyError("Uptimely returned an empty result");
	}
	// Several Uptimely tools report expected failures (not found, unsupported
	// type, plan limit) as a successful `{ error }` object.
	if (
		typeof value === "object" &&
		"error" in value &&
		typeof (value as { error: unknown }).error === "string" &&
		Object.keys(value).length === 1
	) {
		throw new UptimelyError((value as { error: string }).error);
	}
	return value as T;
};

export interface UptimelyClient {
	callTool<T = unknown>(
		name: string,
		args?: Record<string, unknown>,
	): Promise<T>;
}

export const createUptimelyClient = (
	options: UptimelyClientOptions,
): UptimelyClient => {
	const url = uptimelyMcpUrl(options.baseUrl);
	const timeoutMs = options.timeoutMs ?? UPTIMELY_REQUEST_TIMEOUT_MS;
	const fetchImpl = options.fetchImpl ?? fetch;
	let nextId = 1;
	let sessionId: string | null = null;
	let initialized: Promise<void> | null = null;

	const post = async (
		payload: Record<string, unknown>,
		expectResponse: boolean,
	): Promise<JsonRpcResponse | null> => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${options.apiKey}`,
		};
		// Spec: every request after the handshake carries the negotiated version.
		if (payload.method !== "initialize") {
			headers["MCP-Protocol-Version"] = UPTIMELY_MCP_PROTOCOL_VERSION;
		}
		if (sessionId) {
			headers["Mcp-Session-Id"] = sessionId;
		}
		let response: Response;
		let body: string;
		try {
			response = await fetchImpl(url, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			body = await response.text();
		} catch (error) {
			if (controller.signal.aborted) {
				throw new UptimelyError(
					`Uptimely did not respond within ${Math.round(timeoutMs / 1000)}s`,
					{ code: "TIMEOUT" },
				);
			}
			throw new UptimelyError(
				`Could not reach Uptimely at ${url}: ${
					error instanceof Error ? error.message : String(error)
				}`,
				{ code: "NETWORK" },
			);
		} finally {
			clearTimeout(timer);
		}

		const returnedSession = response.headers.get("mcp-session-id");
		if (returnedSession) sessionId = returnedSession;

		const id = typeof payload.id === "number" ? payload.id : -1;
		const parsed = expectResponse
			? parseJsonRpcBody(body, response.headers.get("content-type"), id)
			: null;

		// Checked first: Uptimely answers a bad key with HTTP 401 and an OAuth
		// error body, which must not be read as a JSON-RPC error.
		if (response.status === 401 || response.status === 403) {
			throw new UptimelyError(
				"Uptimely rejected the API key. Check the project API key in Settings → Integrations.",
				{ code: response.status },
			);
		}
		if (parsed?.error) {
			throw new UptimelyError(
				parsed.error.message || `Uptimely JSON-RPC error ${parsed.error.code}`,
				{ code: parsed.error.code },
			);
		}
		if (!response.ok) {
			throw new UptimelyError(
				`Uptimely responded with HTTP ${response.status}`,
				{ code: response.status },
			);
		}
		if (expectResponse && !parsed) {
			throw new UptimelyError("Uptimely returned an unreadable response");
		}
		return parsed;
	};

	const initialize = async () => {
		await post(
			{
				jsonrpc: "2.0",
				id: nextId++,
				method: "initialize",
				params: {
					protocolVersion: UPTIMELY_MCP_PROTOCOL_VERSION,
					capabilities: {},
					clientInfo: { name: "dokploy-community", version: "1.0.0" },
				},
			},
			true,
		);
	};

	const ensureInitialized = () => {
		if (!initialized) {
			initialized = initialize().catch((error) => {
				initialized = null;
				throw error;
			});
		}
		return initialized;
	};

	return {
		async callTool<T = unknown>(
			name: string,
			args: Record<string, unknown> = {},
		) {
			await ensureInitialized();
			const response = await post(
				{
					jsonrpc: "2.0",
					id: nextId++,
					method: "tools/call",
					params: {
						name: UPTIMELY_EXECUTE_TOOL,
						arguments: { code: buildCodeModeProgram(name, args) },
					},
				},
				true,
			);
			return unwrapCodeModeResult<T>(response?.result);
		},
	};
};
