import {
	buildCodeModeProgram,
	createUptimelyClient,
	parseSandboxError,
	parseSseMessages,
	UptimelyError,
} from "@dokploy/server/utils/uptimely/client";
import { describe, expect, it, vi } from "vitest";

/**
 * Uptimely's MCP server runs in "Code Mode": it lists only `search_tools` and
 * `execute_typescript`, and every real tool is an `external_<name>(input)`
 * function inside the TypeScript sandbox. The client speaks MCP Streamable
 * HTTP by hand (`initialize` then `tools/call`) and turns every
 * `callTool("uptimely_x", args)` into one `execute_typescript` call.
 *
 * The fixtures below mirror responses recorded from the live server on
 * 2026-10-03 (ids replaced with placeholders).
 */

type Handler = (body: {
	id: number;
	method: string;
	params?: { name?: string; arguments?: Record<string, unknown> };
}) => { status?: number; contentType?: string; body: string };

const fakeFetch = (handler: Handler) =>
	vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body));
		const out = handler(body);
		return new Response(out.body, {
			status: out.status ?? 200,
			headers: { "content-type": out.contentType ?? "application/json" },
		});
	});

const initResult = (id: number) =>
	JSON.stringify({
		jsonrpc: "2.0",
		id,
		result: {
			protocolVersion: "2025-03-26",
			capabilities: { tools: {} },
			serverInfo: { name: "uptimely", version: "1" },
		},
	});

const sse = (payload: unknown) =>
	`event: message\ndata: ${JSON.stringify(payload)}\n\n`;

/** An `execute_typescript` tools/call result carrying `envelope` as text. */
const executeResult = (envelope: unknown) => ({
	content: [{ type: "text", text: JSON.stringify(envelope) }],
});

const rpc = (id: number, result: unknown) =>
	JSON.stringify({ jsonrpc: "2.0", id, result });

const projectList = {
	projects: [
		{ id: "p-1", name: "Devino Team", slug: "devino-team" },
		{ id: "p-2", name: "QA Sandbox", slug: "qa-sandbox-hezek99u" },
	],
	defaultProjectId: "p-1",
};

// Recorded sandbox failures.
const PROJECT_DENIED =
	"PROJECT_ACCESS_DENIED: This credential cannot access project 00000000-0000-0000-0000-000000000000. Call uptimely_project_list to get the project IDs this connection can access, then retry with one of those.";
const INVALID_INPUT =
	"INVALID_INPUT: Tool input validation failed for uptimely_status_page_list. Please fix the following errors and try again:\n- projectId: Invalid input: expected string, received undefined\n\nProvided arguments: {}";

const clientWith = (handler: Handler, extra: { timeoutMs?: number } = {}) =>
	createUptimelyClient({
		baseUrl: "https://uptimely.test/",
		apiKey: "key-123",
		fetchImpl: fakeFetch(handler) as unknown as typeof fetch,
		...extra,
	});

const failingWith = (message: string) =>
	clientWith((req) =>
		req.method === "initialize"
			? { body: initResult(req.id) }
			: {
					body: rpc(
						req.id,
						executeResult({
							success: false,
							logs: [],
							error: { message, name: "Error" },
						}),
					),
				},
	);

const caught = async (promise: Promise<unknown>) =>
	(await promise.catch((e: unknown) => e)) as UptimelyError;

/**
 * Runs a generated program the way the Uptimely sandbox does: the
 * `external_*` function is in scope and the body may `await` and `return`.
 */
const runProgram = async (
	code: string,
	name: string,
	impl: (input: unknown) => unknown,
) => {
	const AsyncFunction = Object.getPrototypeOf(async () => {})
		.constructor as new (
		...args: string[]
	) => (...fnArgs: unknown[]) => Promise<unknown>;
	return new AsyncFunction(name, code)(impl);
};

describe("buildCodeModeProgram", () => {
	it("calls the matching external_* function with the JSON-embedded input", async () => {
		const code = buildCodeModeProgram("uptimely_status_page_list", {
			projectId: "p-1",
		});
		expect(code).toContain("await external_uptimely_status_page_list(input)");
		const seen: unknown[] = [];
		const result = await runProgram(
			code,
			"external_uptimely_status_page_list",
			(input) => {
				seen.push(input);
				return { ok: true };
			},
		);
		expect(result).toEqual({ ok: true });
		expect(seen).toEqual([{ projectId: "p-1" }]);
	});

	it("does not double the external_ prefix", () => {
		expect(buildCodeModeProgram("external_uptimely_project_list")).toContain(
			"await external_uptimely_project_list(input)",
		);
	});

	it("passes hostile argument values through as data, never as code", async () => {
		const hostile = {
			name: `"); throw new Error("pwned"); ("`,
			description:
				"line1\nline2 \u2028 \u2029 `${process.exit()}` \\ ' \" </script>",
			url: "https://x.test/?a=1&b=2#frag",
			nested: { list: ["'; return 1; '", 1, true, null] },
			["__proto__"]: { polluted: true },
		};
		// A computed "__proto__" key is an own property; JSON.parse keeps it one.
		const args = JSON.parse(JSON.stringify(hostile)) as Record<string, unknown>;
		const code = buildCodeModeProgram("uptimely_monitor_create", args);

		// The only code is the fixed two-line template.
		expect(code.split("\n")).toHaveLength(2);
		expect(code).not.toMatch(/\u2028|\u2029/);

		let seen: Record<string, unknown> | undefined;
		await runProgram(code, "external_uptimely_monitor_create", (input) => {
			seen = input as Record<string, unknown>;
			return {};
		});
		expect(seen?.name).toBe(hostile.name);
		expect(seen?.description).toBe(hostile.description);
		expect(seen?.nested).toEqual(hostile.nested);
		expect(Object.getOwnPropertyNames(seen)).toContain("__proto__");
		expect((seen as { polluted?: boolean }).polluted).toBeUndefined();
	});

	it("rejects a tool name that is not a plain identifier", () => {
		for (const bad of [
			"uptimely_x(); evil(",
			"a-b",
			"",
			"x y",
			"x\nreturn 1",
		]) {
			expect(() => buildCodeModeProgram(bad)).toThrow(UptimelyError);
		}
	});
});

describe("parseSandboxError", () => {
	it("splits the code from the details", () => {
		const parsed = parseSandboxError(PROJECT_DENIED);
		expect(parsed.code).toBe("PROJECT_ACCESS_DENIED");
		expect(parsed.message).toMatch(/^This credential cannot access project/);
		expect(parsed.settingsUrl).toBeUndefined();
	});

	it("reads the trailing JSON fields (settingsUrl)", () => {
		const parsed = parseSandboxError(
			'AI_WRITE_OPS_DISABLED: AI write operations are disabled for this project. {"settingsUrl":"https://uptimely.test/dashboard/p/settings/api-keys"}',
		);
		expect(parsed).toMatchObject({
			code: "AI_WRITE_OPS_DISABLED",
			message: "AI write operations are disabled for this project.",
			settingsUrl: "https://uptimely.test/dashboard/p/settings/api-keys",
		});
	});

	it("keeps a 'Provided arguments: {}' tail as part of the message", () => {
		const parsed = parseSandboxError(INVALID_INPUT);
		expect(parsed.code).toBe("INVALID_INPUT");
		expect(parsed.message).toContain("Provided arguments: {}");
		expect(parsed.fields).toBeUndefined();
	});

	it("maps a missing external_* function to a clear message", () => {
		expect(
			parseSandboxError("'external_uptimely_monitor_create' is not defined"),
		).toEqual({
			code: "TOOL_UNAVAILABLE",
			message: expect.stringContaining("uptimely_monitor_create"),
		});
	});

	it("passes an uncoded message through unchanged", () => {
		expect(parseSandboxError("boom")).toEqual({ message: "boom" });
	});
});

describe("uptimely client (code mode)", () => {
	it("initializes, then runs one execute_typescript call, parsing a plain JSON body", async () => {
		const fetchImpl = fakeFetch((req) => {
			if (req.method === "initialize") return { body: initResult(req.id) };
			return {
				body: rpc(
					req.id,
					executeResult({ success: true, result: projectList, logs: [] }),
				),
			};
		});
		const client = createUptimelyClient({
			baseUrl: "https://uptimely.test/",
			apiKey: "key-123",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});

		const result = await client.callTool("uptimely_project_list");

		expect(result).toEqual(projectList);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		const [url, init] = fetchImpl.mock.calls[0] ?? [];
		expect(url).toBe("https://uptimely.test/api/mcp");
		const headers = init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer key-123");
		expect(headers.Accept).toContain("text/event-stream");
		const init1 = JSON.parse(String(init?.body));
		expect(init1.method).toBe("initialize");
		expect(init1.params.protocolVersion).toBe("2025-03-26");
		const call = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
		expect(call.method).toBe("tools/call");
		expect(call.params.name).toBe("execute_typescript");
		expect(Object.keys(call.params.arguments)).toEqual(["code"]);
		expect(call.params.arguments.code).toBe(
			buildCodeModeProgram("uptimely_project_list", {}),
		);
		expect(call.params.arguments.code).toContain(
			"external_uptimely_project_list",
		);
	});

	it("sends the arguments inside the generated program", async () => {
		let code = "";
		const client = clientWith((req) => {
			if (req.method === "initialize") return { body: initResult(req.id) };
			code = String(req.params?.arguments?.code);
			return {
				body: rpc(req.id, executeResult({ success: true, result: { a: 1 } })),
			};
		});
		await client.callTool("uptimely_monitor_get", {
			projectId: "p-1",
			monitorId: "m-1",
		});
		expect(code).toBe(
			buildCodeModeProgram("uptimely_monitor_get", {
				projectId: "p-1",
				monitorId: "m-1",
			}),
		);
		let seen: unknown;
		await runProgram(code, "external_uptimely_monitor_get", (input) => {
			seen = input;
			return {};
		});
		expect(seen).toEqual({ projectId: "p-1", monitorId: "m-1" });
	});

	it("parses SSE-framed responses", async () => {
		const client = clientWith((req) => {
			if (req.method === "initialize") {
				return {
					contentType: "text/event-stream",
					body: sse(JSON.parse(initResult(req.id))),
				};
			}
			return {
				contentType: "text/event-stream",
				body: sse({
					jsonrpc: "2.0",
					id: req.id,
					result: executeResult({ success: true, result: projectList }),
				}),
			};
		});

		await expect(client.callTool("uptimely_project_list")).resolves.toEqual(
			projectList,
		);
	});

	it("reads the envelope from structuredContent when the server sends it", async () => {
		const client = clientWith((req) =>
			req.method === "initialize"
				? { body: initResult(req.id) }
				: {
						body: rpc(req.id, {
							structuredContent: { success: true, result: projectList },
						}),
					},
		);
		await expect(client.callTool("uptimely_project_list")).resolves.toEqual(
			projectList,
		);
	});

	it("initializes once for several calls on the same client", async () => {
		const fetchImpl = fakeFetch((req) =>
			req.method === "initialize"
				? { body: initResult(req.id) }
				: {
						body: rpc(
							req.id,
							executeResult({ success: true, result: { ok: true } }),
						),
					},
		);
		const client = createUptimelyClient({
			baseUrl: "https://uptimely.test",
			apiKey: "k",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		await Promise.all([client.callTool("a"), client.callTool("b")]);
		const methods = fetchImpl.mock.calls.map(
			(c) => JSON.parse(String(c[1]?.body)).method,
		);
		expect(methods.filter((m) => m === "initialize")).toHaveLength(1);
		expect(methods.filter((m) => m === "tools/call")).toHaveLength(2);
	});

	it("surfaces a JSON-RPC error with the server message", async () => {
		const client = clientWith((req) =>
			req.method === "initialize"
				? { body: initResult(req.id) }
				: {
						body: JSON.stringify({
							jsonrpc: "2.0",
							id: req.id,
							error: { code: -32602, message: "Unknown tool: nope" },
						}),
					},
		);
		const error = await caught(client.callTool("uptimely_project_list"));
		expect(error).toBeInstanceOf(UptimelyError);
		expect(error.message).toBe("Unknown tool: nope");
		expect(error.code).toBe(-32602);
	});

	it("maps a denied project to a code and a useful message", async () => {
		const error = await caught(
			failingWith(PROJECT_DENIED).callTool("uptimely_status_page_list", {
				projectId: "nope",
			}),
		);
		expect(error).toBeInstanceOf(UptimelyError);
		expect(error.code).toBe("PROJECT_ACCESS_DENIED");
		expect(error.message).toContain("cannot access project");
		expect(error.message).not.toMatch(/^PROJECT_ACCESS_DENIED/);
	});

	it("maps the AI write gate to AI_WRITE_OPS_DISABLED with its settings link", async () => {
		const error = await caught(
			failingWith(
				'AI_WRITE_OPS_DISABLED: AI write operations are disabled for this project. {"settingsUrl":"https://uptimely.test/dashboard/p/settings/api-keys"}',
			).callTool("uptimely_monitor_create", {}),
		);
		expect(error).toBeInstanceOf(UptimelyError);
		expect(error.message).toBe(
			"AI write operations are disabled for this project.",
		);
		expect(error.code).toBe("AI_WRITE_OPS_DISABLED");
		expect(error.settingsUrl).toBe(
			"https://uptimely.test/dashboard/p/settings/api-keys",
		);
	});

	it("maps invalid input", async () => {
		const error = await caught(
			failingWith(INVALID_INPUT).callTool("uptimely_status_page_list"),
		);
		expect(error.code).toBe("INVALID_INPUT");
		expect(error.message).toContain("projectId");
	});

	it("maps a tool the key cannot reach (ReferenceError) to a clear error", async () => {
		const error = await caught(
			failingWith("'external_uptimely_monitor_create' is not defined").callTool(
				"uptimely_monitor_create",
				{},
			),
		);
		expect(error.code).toBe("TOOL_UNAVAILABLE");
		expect(error.message).toMatch(/does not expose uptimely_monitor_create/);
	});

	it("surfaces a plain sandbox failure message", async () => {
		const error = await caught(
			failingWith("boom").callTool("uptimely_project_list"),
		);
		expect(error).toBeInstanceOf(UptimelyError);
		expect(error.message).toBe("boom");
		expect(error.code).toBeUndefined();
	});

	it("surfaces a transport-level tool denial (isError)", async () => {
		const denial = {
			code: "AI_WRITE_OPS_DISABLED",
			message: "AI write operations are disabled for this project.",
			settingsUrl: "https://uptimely.test/dashboard/p/settings/api-keys",
		};
		const client = clientWith((req) =>
			req.method === "initialize"
				? { body: initResult(req.id) }
				: {
						contentType: "text/event-stream",
						body: sse({
							jsonrpc: "2.0",
							id: req.id,
							result: {
								isError: true,
								content: [{ type: "text", text: JSON.stringify(denial) }],
								structuredContent: denial,
							},
						}),
					},
		);
		const error = await caught(client.callTool("uptimely_monitor_create", {}));
		expect(error.message).toBe(denial.message);
		expect(error.code).toBe("AI_WRITE_OPS_DISABLED");
		expect(error.settingsUrl).toBe(denial.settingsUrl);
	});

	it("treats a lone { error } tool output as a failure", async () => {
		const client = clientWith((req) =>
			req.method === "initialize"
				? { body: initResult(req.id) }
				: {
						body: rpc(
							req.id,
							executeResult({
								success: true,
								result: { error: "Monitor not found or access denied." },
								logs: [],
							}),
						),
					},
		);
		await expect(client.callTool("uptimely_monitor_get")).rejects.toThrow(
			"Monitor not found or access denied.",
		);
	});

	it("fails clearly when the program returned nothing", async () => {
		const client = clientWith((req) =>
			req.method === "initialize"
				? { body: initResult(req.id) }
				: { body: rpc(req.id, executeResult({ success: true, logs: [] })) },
		);
		await expect(client.callTool("uptimely_project_list")).rejects.toThrow(
			/empty result/,
		);
	});

	it("rejects a response that is not an execute_typescript envelope", async () => {
		const client = clientWith((req) =>
			req.method === "initialize"
				? { body: initResult(req.id) }
				: { body: rpc(req.id, executeResult(projectList)) },
		);
		await expect(client.callTool("uptimely_project_list")).rejects.toThrow(
			/unexpected tool result/,
		);
	});

	it("reports a rejected API key on HTTP 401", async () => {
		const fetchImpl = fakeFetch(() => ({ status: 401, body: "" }));
		const client = createUptimelyClient({
			baseUrl: "https://uptimely.test",
			apiKey: "bad",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		await expect(client.callTool("uptimely_project_list")).rejects.toThrow(
			/rejected the API key/,
		);
	});

	it("shows the API key message when the 401 body is an OAuth error", async () => {
		const fetchImpl = fakeFetch(() => ({
			status: 401,
			body: JSON.stringify({
				error: "invalid_token",
				error_description: "No authorization provided",
			}),
		}));
		const client = createUptimelyClient({
			baseUrl: "https://uptimely.test",
			apiKey: "bad",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		await expect(client.callTool("uptimely_project_list")).rejects.toThrow(
			"Uptimely rejected the API key. Check the project API key in Settings → Integrations.",
		);
	});

	it("still surfaces a JSON-RPC error object's message", async () => {
		const fetchImpl = fakeFetch((req) => ({
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: req.id,
				error: { code: -32602, message: "Invalid params" },
			}),
		}));
		const client = createUptimelyClient({
			baseUrl: "https://uptimely.test",
			apiKey: "k",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		await expect(client.callTool("uptimely_project_list")).rejects.toThrow(
			"Invalid params",
		);
	});

	it("reports the HTTP status for a non-401 error with a string error body", async () => {
		const fetchImpl = fakeFetch(() => ({
			status: 500,
			body: JSON.stringify({ error: "internal_error" }),
		}));
		const client = createUptimelyClient({
			baseUrl: "https://uptimely.test",
			apiKey: "k",
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		await expect(client.callTool("uptimely_project_list")).rejects.toThrow(
			"Uptimely responded with HTTP 500",
		);
	});

	it("times out instead of hanging", async () => {
		const fetchImpl = vi.fn(
			(_url: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		);
		const client = createUptimelyClient({
			baseUrl: "https://uptimely.test",
			apiKey: "k",
			timeoutMs: 20,
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		await expect(client.callTool("uptimely_project_list")).rejects.toThrow(
			/did not respond/,
		);
	});

	it("parseSseMessages joins multi-line data and skips non-JSON frames", () => {
		const body = ': keep-alive\n\nevent: message\ndata: {"a":\ndata: 1}\n\n';
		expect(parseSseMessages(body)).toEqual([{ a: 1 }]);
	});
});
