import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	lookup: vi.fn(),
}));

vi.mock("node:dns", () => ({
	lookup: mocks.lookup,
}));

const loadModule = async (isCloud: boolean) => {
	vi.resetModules();
	vi.doMock("@dokploy/server/constants", () => ({ IS_CLOUD: isCloud }));
	return await import(
		"@dokploy/server/services/logs-and-metrics/provider-fetch"
	);
};

const loadFetch = async (isCloud: boolean) =>
	(await loadModule(isCloud)).providerFetch;

const resolvesTo = (...addresses: string[]) =>
	mocks.lookup.mockImplementation(
		(_host: string, _options: unknown, callback: Function) =>
			callback(
				null,
				addresses.map((address) => ({
					address,
					family: address.includes(":") ? 6 : 4,
				})),
			),
	);

describe("providerFetch — blocked endpoint guard", () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		mocks.lookup.mockReset();
		global.fetch = vi.fn().mockResolvedValue(new Response("ok"));
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("rejects a literal AWS/GCP/Azure metadata IP without ever calling fetch", async () => {
		const providerFetch = await loadFetch(false);
		await expect(
			providerFetch("http://169.254.169.254/latest/meta-data/"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
		expect(mocks.lookup).not.toHaveBeenCalled();
	});

	it("rejects the metadata IP written as an IPv4-mapped IPv6 address", async () => {
		const providerFetch = await loadFetch(false);
		for (const address of ["[::ffff:169.254.169.254]", "[::ffff:a9fe:a9fe]"]) {
			await expect(
				providerFetch(`http://${address}/latest/meta-data/`),
				`expected ${address} to be rejected`,
			).rejects.toThrow(/metadata/i);
		}
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("rejects the AWS ECS metadata IPv6 address", async () => {
		const providerFetch = await loadFetch(false);
		await expect(
			providerFetch("http://[fd00:ec2::254]/v2/credentials"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("rejects every fe80::/10 link-local address, not just literal fe80: ones", async () => {
		const providerFetch = await loadFetch(false);
		for (const address of [
			"[fe80::1]",
			"[fe90::1]",
			"[fea0::1]",
			"[febf::1]",
		]) {
			await expect(
				providerFetch(`http://${address}/`),
				`expected ${address} to be rejected`,
			).rejects.toThrow(/metadata/i);
		}
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("does not block a hostname just because it starts like a link-local prefix", async () => {
		const providerFetch = await loadFetch(false);

		await providerFetch("https://feature-logs.example.com/ready");
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("rejects the GCP metadata hostname without needing DNS resolution", async () => {
		const providerFetch = await loadFetch(false);
		await expect(
			providerFetch("http://metadata.google.internal/computeMetadata/v1/"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
		expect(mocks.lookup).not.toHaveBeenCalled();
	});

	it("rejects loopback and private-network endpoints in cloud", async () => {
		const providerFetch = await loadFetch(true);

		for (const url of [
			"http://10.0.0.5:3100/ready",
			"http://127.0.0.1:3100/ready",
			"http://localhost:3100/ready",
			"http://[::1]:3100/ready",
			"http://0.0.0.0:3100/ready",
			"http://100.100.100.200/latest/meta-data/",
			"http://[::]:3100/ready",
		]) {
			await expect(
				providerFetch(url),
				`expected ${url} to be rejected`,
			).rejects.toThrow(/blocked/i);
		}
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("does not follow redirects", async () => {
		const providerFetch = await loadFetch(false);

		await providerFetch("https://logs.example.com/ready");
		expect(global.fetch).toHaveBeenCalledWith(
			"https://logs.example.com/ready",
			expect.objectContaining({ redirect: "error" }),
		);
	});
});

describe("providerFetch — address checked at connect time", () => {
	let server: Server;
	let port: number;
	let hostHeader: string | undefined;

	beforeEach(async () => {
		mocks.lookup.mockReset();
		hostHeader = undefined;
		server = createServer((req, res) => {
			hostHeader = req.headers.host;
			res.end("ok");
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		port = (server.address() as AddressInfo).port;
	});

	afterEach(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	it("rejects a hostname whose lookup returns a metadata address", async () => {
		const providerFetch = await loadFetch(false);
		resolvesTo("203.0.113.10", "169.254.169.254");

		await expect(
			providerFetch("http://attacker-controlled.example.com/"),
		).rejects.toThrow(/metadata/i);
		expect(mocks.lookup).toHaveBeenCalledWith(
			"attacker-controlled.example.com",
			expect.anything(),
			expect.any(Function),
		);
	});

	it("rejects a hostname resolving to a private address in cloud", async () => {
		const providerFetch = await loadFetch(true);
		resolvesTo("127.0.0.1");

		await expect(
			providerFetch(`http://loki.internal.example.com:${port}/ready`),
		).rejects.toThrow(/blocked/i);
		expect(hostHeader).toBeUndefined();
	});

	it("rejects when DNS resolution fails", async () => {
		const providerFetch = await loadFetch(false);
		mocks.lookup.mockImplementation(
			(_host: string, _options: unknown, callback: Function) =>
				callback(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" })),
		);

		await expect(
			providerFetch("http://does-not-exist.invalid/"),
		).rejects.toThrow();
		expect(hostHeader).toBeUndefined();
	});

	it("connects to the address it validated, keeping the original Host header (self-hosted private endpoint)", async () => {
		const providerFetch = await loadFetch(false);
		resolvesTo("127.0.0.1");

		const response = await providerFetch(
			`http://loki.internal.example.com:${port}/ready`,
		);
		expect(await response.text()).toBe("ok");
		expect(hostHeader).toBe(`loki.internal.example.com:${port}`);
	});

	it("passes a public address through in cloud", async () => {
		const { guardedLookup } = await loadModule(true);
		resolvesTo("203.0.113.10");

		const result = await new Promise((resolve, reject) =>
			guardedLookup("api.datadoghq.com", { all: true }, (error, addresses) =>
				error ? reject(error) : resolve(addresses),
			),
		);
		expect(result).toEqual([{ address: "203.0.113.10", family: 4 }]);
	});
});
