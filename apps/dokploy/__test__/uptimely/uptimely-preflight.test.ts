import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import {
	assertPublicHttpsUrl,
	checkUrl,
	isNonPublicIp,
	PREFLIGHT_MAX_URLS,
	PREFLIGHT_USER_AGENT,
	preflightUrls,
} from "@dokploy/server/utils/uptimely/preflight";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * `checkUrl` is exercised against a REAL http server on 127.0.0.1 (no fetch
 * mocks). Production only ever checks https URLs of public hosts; that policy
 * lives in `assertPublicHttpsUrl` / `preflightUrls` and is tested separately.
 */

let server: Server;
let base = "";
let hits: { path: string; userAgent: string | undefined }[] = [];
const hangingSockets = new Set<ServerResponse>();

const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> =
	{
		"/ok": (_req, res) => {
			res.writeHead(200, { "content-type": "text/plain" });
			res.end("fine");
		},
		"/missing": (_req, res) => {
			res.writeHead(404);
			res.end("nope");
		},
		"/boom": (_req, res) => {
			res.writeHead(500);
			res.end("boom");
		},
		"/redirect": (_req, res) => {
			res.writeHead(301, { location: "/ok" });
			res.end();
		},
		"/redirect-to-missing": (_req, res) => {
			res.writeHead(302, { location: "/missing" });
			res.end();
		},
		"/loop": (_req, res) => {
			res.writeHead(302, { location: "/loop" });
			res.end();
		},
		"/not-modified": (_req, res) => {
			res.writeHead(304);
			res.end();
		},
		"/big": (_req, res) => {
			res.writeHead(200);
			// Far more than a preflight should ever download.
			res.write(Buffer.alloc(1024 * 1024, "a"));
			res.end(Buffer.alloc(8 * 1024 * 1024, "b"));
		},
		"/hang": (_req, res) => {
			// Never answers: the client must give up by itself.
			hangingSockets.add(res);
		},
	};

beforeAll(async () => {
	server = createServer((req, res) => {
		const path = (req.url ?? "/").split("?")[0] as string;
		hits.push({ path, userAgent: req.headers["user-agent"] });
		const handler = routes[path];
		if (!handler) {
			res.writeHead(404);
			res.end();
			return;
		}
		handler(req, res);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	for (const res of hangingSockets) res.destroy();
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
	hits = [];
});

describe("checkUrl (real local server)", () => {
	it("reports a 200 as ok", async () => {
		await expect(checkUrl(`${base}/ok`)).resolves.toEqual({
			url: `${base}/ok`,
			status: 200,
			ok: true,
		});
	});

	it("reports a 404 as not ok, with its status", async () => {
		const result = await checkUrl(`${base}/missing`);
		expect(result).toEqual({ url: `${base}/missing`, status: 404, ok: false });
	});

	it("reports a 5xx as not ok", async () => {
		const result = await checkUrl(`${base}/boom`);
		expect(result.status).toBe(500);
		expect(result.ok).toBe(false);
	});

	it("follows a 301 to a 200", async () => {
		const result = await checkUrl(`${base}/redirect`);
		expect(result).toMatchObject({ status: 200, ok: true });
		expect(hits.map((h) => h.path)).toEqual(["/redirect", "/ok"]);
	});

	it("reports the final status of a redirect chain", async () => {
		const result = await checkUrl(`${base}/redirect-to-missing`);
		expect(result).toMatchObject({ status: 404, ok: false });
	});

	it("treats a final 3xx answer as ok", async () => {
		const result = await checkUrl(`${base}/not-modified`);
		expect(result).toMatchObject({ status: 304, ok: true });
	});

	it("gives up on a redirect loop", async () => {
		const result = await checkUrl(`${base}/loop`, { maxRedirects: 3 });
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/redirects/);
		expect(hits).toHaveLength(4);
	});

	it("times out on a route that never answers", async () => {
		const started = Date.now();
		const result = await checkUrl(`${base}/hang`, { timeoutMs: 300 });
		expect(result).toMatchObject({ status: null, ok: false });
		expect(result.error).toMatch(/Timed out/);
		expect(Date.now() - started).toBeLessThan(3_000);
	});

	it("does not download the body", async () => {
		const started = Date.now();
		const result = await checkUrl(`${base}/big`);
		expect(result).toMatchObject({ status: 200, ok: true });
		expect(Date.now() - started).toBeLessThan(3_000);
	});

	it("identifies itself with a clear User-Agent", async () => {
		await checkUrl(`${base}/ok`);
		expect(hits[0]?.userAgent).toBe(PREFLIGHT_USER_AGENT);
		expect(PREFLIGHT_USER_AGENT).toBe("Dokploy-Uptimely-Preflight");
	});

	it("reports a refused connection instead of throwing", async () => {
		const closed = createServer();
		await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
		const port = (closed.address() as AddressInfo).port;
		await new Promise<void>((resolve) => closed.close(() => resolve()));
		const result = await checkUrl(`http://127.0.0.1:${port}/`);
		expect(result).toMatchObject({ status: null, ok: false });
		expect(result.error).toBeTruthy();
	});

	it("validates every hop, so a redirect cannot reach a refused URL", async () => {
		const result = await checkUrl(`${base}/redirect`, {
			validateUrl: (url) => {
				if (url.pathname === "/ok") throw new Error("hop refused");
			},
		});
		expect(result).toMatchObject({ status: null, ok: false });
		expect(result.error).toBe("hop refused");
		// The redirect target was never requested.
		expect(hits.map((h) => h.path)).toEqual(["/redirect"]);
	});
});

describe("https-only / public-host boundary", () => {
	const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

	it.each([
		"http://example.com/",
		"ftp://example.com/",
		"https://user:pass@example.com/",
		"https://example.com:8443/",
		"https://localhost/",
		"https://app.localhost/",
		"https://127.0.0.1/",
		"https://10.0.0.5/",
		"https://169.254.169.254/latest/meta-data/",
		"https://192.168.1.1/",
		"https://172.16.0.1/",
		"https://100.64.0.1/",
		"https://[::1]/",
		"https://[fd00::1]/",
		"https://[::ffff:127.0.0.1]/",
	])("refuses %s", async (url) => {
		await expect(
			assertPublicHttpsUrl(new URL(url), publicLookup),
		).rejects.toThrow();
	});

	it("refuses a hostname that resolves to a private address", async () => {
		await expect(
			assertPublicHttpsUrl(new URL("https://evil.example/"), async () => [
				{ address: "93.184.216.34", family: 4 },
				{ address: "127.0.0.1", family: 4 },
			]),
		).rejects.toThrow(/Private and loopback/);
	});

	it("refuses a hostname that does not resolve", async () => {
		await expect(
			assertPublicHttpsUrl(new URL("https://nope.example/"), async () => {
				throw new Error("ENOTFOUND");
			}),
		).rejects.toThrow(/DNS/);
	});

	it("accepts a public https host and a public IP literal", async () => {
		await expect(
			assertPublicHttpsUrl(new URL("https://api.example.com/health"), publicLookup),
		).resolves.toBeUndefined();
		await expect(
			assertPublicHttpsUrl(new URL("https://93.184.216.34/")),
		).resolves.toBeUndefined();
	});

	it("classifies addresses", () => {
		expect(isNonPublicIp("8.8.8.8")).toBe(false);
		expect(isNonPublicIp("172.32.0.1")).toBe(false);
		expect(isNonPublicIp("172.31.255.255")).toBe(true);
		expect(isNonPublicIp("2606:4700:4700::1111")).toBe(false);
		expect(isNonPublicIp("fe80::1")).toBe(true);
		expect(isNonPublicIp("not an ip")).toBe(true);
	});

	it("preflightUrls refuses http and loopback URLs without connecting", async () => {
		const results = await preflightUrls([
			`${base}/ok`,
			"https://127.0.0.1/",
			"https://example.com:8443/",
		]);
		expect(results.map((r) => r.ok)).toEqual([false, false, false]);
		expect(results[0]?.error).toMatch(/Only https/);
		expect(results.every((r) => r.status === null)).toBe(true);
		// The local server never saw a request.
		expect(hits).toHaveLength(0);
	});

	it("preflightUrls caps the number of URLs", async () => {
		const urls = Array.from(
			{ length: PREFLIGHT_MAX_URLS + 10 },
			(_, i) => `http://host-${i}.invalid/`,
		);
		expect(await preflightUrls(urls)).toHaveLength(PREFLIGHT_MAX_URLS);
	});
});
