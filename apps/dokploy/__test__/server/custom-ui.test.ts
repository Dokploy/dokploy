import http from "node:http";
import net, { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type CompatibilityResult,
	checkManifest,
	createCompatibilityCheck,
	createUiRequestHandler,
	getPathname,
	isApiPath,
	resolveUiMode,
} from "@/server/utils/custom-ui";

const MANIFEST = {
	name: "my-ui",
	version: "1.0.0",
	dokploy: ">=0.30.0 <0.31.0",
};
const quietLog = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("resolveUiMode", () => {
	it("uses the built-in UI by default", () => {
		expect(resolveUiMode({})).toEqual({ kind: "default" });
	});

	it("disables the UI when DOKPLOY_DISABLE_UI is true", () => {
		expect(resolveUiMode({ DOKPLOY_DISABLE_UI: "true" })).toEqual({
			kind: "disabled",
		});
		expect(resolveUiMode({ DOKPLOY_DISABLE_UI: "1" })).toEqual({
			kind: "default",
		});
	});

	it("uses a custom UI when DOKPLOY_UI_URL is set, even if the UI is disabled", () => {
		const mode = resolveUiMode({
			DOKPLOY_UI_URL: " http://my-ui:3000/base?token=x#frag ",
			DOKPLOY_DISABLE_UI: "true",
		});
		expect(mode.kind === "custom" && mode.target.href).toBe(
			"http://my-ui:3000/base",
		);
	});

	it("falls back to the built-in UI and logs when DOKPLOY_UI_URL is invalid", () => {
		const log = { ...quietLog, error: vi.fn() };
		expect(resolveUiMode({ DOKPLOY_UI_URL: "not a url" }, log)).toEqual({
			kind: "default",
		});
		expect(resolveUiMode({ DOKPLOY_UI_URL: "my-ui:3000" }, log)).toEqual({
			kind: "default",
		});
		expect(log.error).toHaveBeenCalledTimes(2);
		expect(String(log.error.mock.calls[0]?.[0])).toContain("DOKPLOY_UI_URL");
	});
});

describe("getPathname and isApiPath", () => {
	it.each([
		["/api", true],
		["/api/", true],
		["/api/trpc/project.all?batch=1", true],
		["/api/auth/sign-in", true],
		["/apix", false],
		["/", false],
		["/dashboard/projects", false],
		["/api/../dashboard", false],
		["/api/%2e%2e/dashboard", false],
		[undefined, false],
	])("%s -> %s", (url, expected) => {
		const pathname = getPathname(url);
		expect(pathname !== null && isApiPath(pathname)).toBe(expected);
	});

	it("returns null for request targets the URL parser rejects", () => {
		expect(getPathname("//[")).toBeNull();
		expect(getPathname("http://[")).toBeNull();
	});
});

describe("checkManifest", () => {
	it("accepts a manifest whose range includes the Dokploy version", () => {
		expect(checkManifest(MANIFEST, "v0.30.6")).toEqual({
			ok: true,
			manifest: MANIFEST,
		});
	});

	it("rejects a Dokploy version outside the range as a final verdict", () => {
		const result = checkManifest(MANIFEST, "v0.31.0");
		expect(result).toMatchObject({ ok: false, transient: false });
		expect(!result.ok && result.reason).toContain("supports Dokploy");
	});

	it.each([
		[null],
		["text"],
		[{ name: "x", version: "1" }],
		[{ ...MANIFEST, dokploy: "not a range" }],
		[{ ...MANIFEST, name: 1 }],
	])("rejects an invalid manifest %#", (manifest) => {
		expect(checkManifest(manifest, "v0.30.6").ok).toBe(false);
	});
});

describe("createCompatibilityCheck", () => {
	const target = new URL("http://my-ui:3000/base/");
	const ok = () => Response.json(MANIFEST);
	const down = () => {
		throw new Error("ECONNREFUSED");
	};

	const setup = (responses: Array<() => Response>) => {
		let time = 0;
		const fetchImpl = vi.fn(async (_input: URL) => {
			const next = responses.shift();
			if (!next) throw new Error("unexpected fetch");
			return next();
		});
		const check = createCompatibilityCheck({
			target,
			dokployVersion: "v0.30.6",
			fetchImpl: fetchImpl as unknown as typeof fetch,
			now: () => time,
			log: quietLog,
		});
		const advance = (ms: number) => {
			time += ms;
		};
		// Lets a background refresh settle.
		const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
		return { check, fetchImpl, advance, flush };
	};

	it("reads the manifest under the target path once and shares concurrent checks", async () => {
		const { check, fetchImpl } = setup([ok]);
		const results = await Promise.all([check(), check(), check()]);
		expect(results.every((result) => result.ok)).toBe(true);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
			"http://my-ui:3000/base/dokploy-ui.json",
		);
	});

	it("serves the cached result while it revalidates in the background", async () => {
		const { check, fetchImpl, advance, flush } = setup([
			ok,
			() => Response.json({ ...MANIFEST, dokploy: ">=1.0.0" }),
		]);
		await check();
		advance(29_000);
		expect((await check()).ok).toBe(true);
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		advance(2_000);
		expect((await check()).ok).toBe(true);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		await flush();
		expect(await check()).toMatchObject({ ok: false, transient: false });
	});

	it("keeps an active UI through short outages and falls back after repeated failures", async () => {
		quietLog.warn.mockClear();
		const { check, advance, flush } = setup([ok, down, down, down]);
		await check();
		for (const expected of [true, true, false]) {
			advance(31_000);
			await check();
			await flush();
			expect((await check()).ok).toBe(expected);
		}
		const warnings = quietLog.warn.mock.calls.map((call) => String(call[0]));
		expect(
			warnings.filter((w) => w.includes("keeping it active")),
		).toHaveLength(2);
		expect(warnings.at(-1)).toContain("serving the built-in UI");
	});

	it("switches to a UI that starts after Dokploy on the next request", async () => {
		const { check, advance, flush } = setup([down, ok]);
		expect((await check()).ok).toBe(false);
		advance(31_000);
		expect((await check()).ok).toBe(false);
		await flush();
		expect((await check()).ok).toBe(true);
	});

	it("fails right away when the UI is unreachable before it was ever active", async () => {
		const missing = setup([() => new Response("not found", { status: 404 })]);
		expect(await missing.check()).toMatchObject({
			ok: false,
			transient: false,
		});

		const unreachable = setup([down]);
		const result = await unreachable.check();
		expect(result).toMatchObject({ ok: false, transient: true });
		expect(!result.ok && result.reason).toContain("ECONNREFUSED");
	});
});

describe("createUiRequestHandler", () => {
	const servers: http.Server[] = [];
	const compatible = async (): Promise<CompatibilityResult> => ({
		ok: true,
		manifest: MANIFEST,
	});

	const listen = async (handler: http.RequestListener) => {
		const server = http.createServer(handler);
		servers.push(server);
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const { port } = server.address() as AddressInfo;
		return `http://127.0.0.1:${port}`;
	};

	const rawRequest = (url: string, request: string) =>
		new Promise<string>((resolve, reject) => {
			const { hostname, port } = new URL(url);
			const socket = net.connect(Number(port), hostname, () =>
				socket.write(request),
			);
			let data = "";
			socket.on("data", (chunk) => {
				data += chunk;
			});
			socket.on("end", () => resolve(data));
			socket.on("error", reject);
		});

	afterEach(async () => {
		await Promise.all(
			servers.splice(0).map(
				(server) =>
					new Promise((resolve) => {
						server.closeAllConnections();
						server.close(resolve);
					}),
			),
		);
	});

	const nextHandler: http.RequestListener = (req, res) => {
		res.writeHead(200, { "content-type": "text/plain" });
		res.end(`next:${req.url}`);
	};

	it("returns the Next handler unchanged in default mode", () => {
		expect(
			createUiRequestHandler({
				mode: { kind: "default" },
				handleNext: nextHandler,
			}),
		).toBe(nextHandler);
	});

	it("serves only the API in disabled mode", async () => {
		const handler = createUiRequestHandler({
			mode: { kind: "disabled" },
			handleNext: nextHandler,
		});
		const url = await listen((req, res) => handler(req, res));

		expect((await fetch(`${url}/dashboard`)).status).toBe(404);
		expect(await (await fetch(`${url}/api/health`)).text()).toBe(
			"next:/api/health",
		);
	});

	it("proxies pages to a compatible custom UI and keeps the API on Dokploy", async () => {
		const uiUrl = await listen((req, res) => {
			let body = "";
			req.on("data", (chunk) => {
				body += chunk;
			});
			req.on("end", () => {
				res.writeHead(201, {
					"content-type": "application/json",
					"x-ui": "yes",
					"x-frame-options": "ALLOWALL",
					"content-security-policy": "default-src 'self'",
				});
				res.end(
					JSON.stringify({
						method: req.method,
						url: req.url,
						host: req.headers.host,
						cookie: req.headers.cookie,
						forwardedHost: req.headers["x-forwarded-host"],
						secret: req.headers["x-secret"],
						body,
					}),
				);
			});
		});
		const target = new URL(`${uiUrl}/base`);
		const handler = createUiRequestHandler({
			mode: { kind: "custom", target },
			handleNext: nextHandler,
			checkCompatibility: compatible,
		});
		const url = await listen((req, res) => handler(req, res));

		const response = await fetch(`${url}/dashboard?tab=1`, {
			method: "POST",
			headers: {
				cookie: "session=abc",
				"x-forwarded-host": "evil.example",
			},
			body: "hello",
		});
		expect(response.status).toBe(201);
		expect(response.headers.get("x-ui")).toBe("yes");
		expect(response.headers.get("x-frame-options")).toBe("DENY");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("content-security-policy")).toBe(
			"default-src 'self'",
		);
		expect(await response.json()).toEqual({
			method: "POST",
			url: "/base/dashboard?tab=1",
			host: target.host,
			cookie: "session=abc",
			forwardedHost: new URL(url).host,
			body: "hello",
		});
		expect(await (await fetch(`${url}/api/trpc/x`)).text()).toBe(
			"next:/api/trpc/x",
		);
	});

	it("adds the default security headers when the custom UI sets none", async () => {
		const uiUrl = await listen((_req, res) => res.end("ok"));
		const handler = createUiRequestHandler({
			mode: { kind: "custom", target: new URL(uiUrl) },
			handleNext: nextHandler,
			checkCompatibility: compatible,
		});
		const url = await listen((req, res) => handler(req, res));
		const response = await fetch(`${url}/`);
		expect(response.headers.get("content-security-policy")).toBe(
			"frame-ancestors 'none'",
		);
		expect(response.headers.get("referrer-policy")).toBe(
			"strict-origin-when-cross-origin",
		);
	});

	it("falls back to the built-in UI when the custom UI is not compatible", async () => {
		const handler = createUiRequestHandler({
			mode: { kind: "custom", target: new URL("http://127.0.0.1:1") },
			handleNext: nextHandler,
			checkCompatibility: async () => ({
				ok: false,
				reason: "too new",
				transient: false,
			}),
		});
		const url = await listen((req, res) => handler(req, res));
		expect(await (await fetch(`${url}/dashboard`)).text()).toBe(
			"next:/dashboard",
		);
	});

	it("serves the built-in UI for GET and 502 for POST when an active custom UI goes down", async () => {
		const deadUrl = await listen(() => {});
		await new Promise((resolve) => servers.pop()?.close(resolve));
		const invalidate = vi.fn();
		const handler = createUiRequestHandler({
			mode: { kind: "custom", target: new URL(deadUrl) },
			handleNext: nextHandler,
			checkCompatibility: Object.assign(() => compatible(), { invalidate }),
		});
		const url = await listen((req, res) => handler(req, res));
		expect(await (await fetch(`${url}/dashboard`)).text()).toBe(
			"next:/dashboard",
		);
		expect(invalidate).toHaveBeenCalledTimes(1);
		const post = await fetch(`${url}/dashboard`, { method: "POST", body: "x" });
		expect(post.status).toBe(502);
		expect(invalidate).toHaveBeenCalledTimes(2);
	});

	it("lets the built-in UI read the request after the custom UI fails", async () => {
		const deadUrl = await listen(() => {});
		await new Promise((resolve) => servers.pop()?.close(resolve));
		const bodyReadingNext: http.RequestListener = (req, res) => {
			req.resume();
			req.on("end", () => res.end(`next-read:${req.url}`));
		};
		const handler = createUiRequestHandler({
			mode: { kind: "custom", target: new URL(deadUrl) },
			handleNext: bodyReadingNext,
			checkCompatibility: compatible,
		});
		const url = await listen((req, res) => handler(req, res));
		const response = await fetch(`${url}/dashboard`, {
			signal: AbortSignal.timeout(2000),
		});
		expect(await response.text()).toBe("next-read:/dashboard");
	});

	it("closes the client connection when the custom UI dies mid-response", async () => {
		const uiUrl = await listen((_req, res) => {
			res.writeHead(200, { "content-type": "text/plain" });
			res.write("partial");
			setTimeout(() => res.socket?.destroy(), 20);
		});
		const handler = createUiRequestHandler({
			mode: { kind: "custom", target: new URL(uiUrl) },
			handleNext: nextHandler,
			checkCompatibility: compatible,
		});
		const url = await listen((req, res) => handler(req, res));
		const response = await fetch(`${url}/`);
		await expect(response.text()).rejects.toThrow();
	});

	it("cancels the upstream request when the client goes away", async () => {
		let upstreamClosed: () => void = () => {};
		const closed = new Promise<void>((resolve) => {
			upstreamClosed = resolve;
		});
		const uiUrl = await listen((req) => {
			req.socket.on("close", () => upstreamClosed());
		});
		const handler = createUiRequestHandler({
			mode: { kind: "custom", target: new URL(uiUrl) },
			handleNext: nextHandler,
			checkCompatibility: compatible,
		});
		const url = await listen((req, res) => handler(req, res));
		const controller = new AbortController();
		const request = fetch(`${url}/slow`, { signal: controller.signal });
		setTimeout(() => controller.abort(), 50);
		await expect(request).rejects.toThrow();
		await closed;
	});

	it("drops headers that the client lists in Connection", async () => {
		const uiUrl = await listen((req, res) =>
			res.end(JSON.stringify({ secret: req.headers["x-secret"] ?? null })),
		);
		const handler = createUiRequestHandler({
			mode: { kind: "custom", target: new URL(uiUrl) },
			handleNext: nextHandler,
			checkCompatibility: compatible,
		});
		const url = await listen((req, res) => {
			void handler(req, res);
		});
		const response = await rawRequest(
			url,
			"GET / HTTP/1.1\r\nHost: x\r\nConnection: close, x-secret\r\nx-secret: 1\r\n\r\n",
		);
		expect(response).toContain('{"secret":null}');
	});

	it.each([
		[
			"a request target the URL parser rejects",
			"GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
			"400",
		],
		[
			"an HTTP/1.0 request without a Host header",
			"GET /dashboard HTTP/1.0\r\n\r\n",
			"200",
		],
	])("survives %s", async (_name, request, status) => {
		const uiUrl = await listen((_req, res) => res.end("ui"));
		const handler = createUiRequestHandler({
			mode: { kind: "custom", target: new URL(uiUrl) },
			handleNext: nextHandler,
			checkCompatibility: compatible,
		});
		const url = await listen((req, res) => {
			void handler(req, res);
		});
		const response = await rawRequest(url, request);
		expect(response.split(" ")[1]).toBe(status);
		expect(await (await fetch(`${url}/api/health`)).text()).toBe(
			"next:/api/health",
		);
	});
});
