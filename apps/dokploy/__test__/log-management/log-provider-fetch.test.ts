import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
	lookup: mocks.lookup,
}));

const loadFetch = async (isCloud: boolean) => {
	vi.resetModules();
	vi.doMock("@dokploy/server/constants", () => ({ IS_CLOUD: isCloud }));
	const { logProviderFetch } = await import(
		"@dokploy/server/services/log-management/types"
	);
	return logProviderFetch;
};

describe("logProviderFetch — blocked endpoint guard", () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		mocks.lookup.mockReset();
		global.fetch = vi.fn().mockResolvedValue(new Response("ok"));
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("rejects a literal AWS/GCP/Azure metadata IP without ever calling fetch", async () => {
		const logProviderFetch = await loadFetch(false);
		await expect(
			logProviderFetch("http://169.254.169.254/latest/meta-data/"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
		expect(mocks.lookup).not.toHaveBeenCalled();
	});

	it("rejects the metadata IP written as an IPv4-mapped IPv6 address", async () => {
		const logProviderFetch = await loadFetch(false);
		for (const address of ["[::ffff:169.254.169.254]", "[::ffff:a9fe:a9fe]"]) {
			await expect(
				logProviderFetch(`http://${address}/latest/meta-data/`),
				`expected ${address} to be rejected`,
			).rejects.toThrow(/metadata/i);
		}
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("rejects the AWS ECS metadata IPv6 address", async () => {
		const logProviderFetch = await loadFetch(false);
		await expect(
			logProviderFetch("http://[fd00:ec2::254]/v2/credentials"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("rejects every fe80::/10 link-local address, not just literal fe80: ones", async () => {
		const logProviderFetch = await loadFetch(false);
		for (const address of [
			"[fe80::1]",
			"[fe90::1]",
			"[fea0::1]",
			"[febf::1]",
		]) {
			await expect(
				logProviderFetch(`http://${address}/`),
				`expected ${address} to be rejected`,
			).rejects.toThrow(/metadata/i);
		}
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("does not block a hostname just because it starts like a link-local prefix", async () => {
		const logProviderFetch = await loadFetch(false);
		mocks.lookup.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);

		await logProviderFetch("https://feature-logs.example.com/ready");
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("rejects the GCP metadata hostname without needing DNS resolution", async () => {
		const logProviderFetch = await loadFetch(false);
		await expect(
			logProviderFetch("http://metadata.google.internal/computeMetadata/v1/"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
		expect(mocks.lookup).not.toHaveBeenCalled();
	});

	it("rejects a hostname whose DNS record resolves to a metadata address", async () => {
		const logProviderFetch = await loadFetch(false);
		mocks.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

		await expect(
			logProviderFetch("http://attacker-controlled.example.com/"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("allows a private-network endpoint when self-hosted (Loki behind a VPN, say)", async () => {
		const logProviderFetch = await loadFetch(false);
		mocks.lookup.mockResolvedValue([{ address: "10.0.5.20", family: 4 }]);

		await logProviderFetch("http://loki.internal.example.com:3100/ready");
		await logProviderFetch("http://10.0.0.5:3100/ready");
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it("rejects loopback and private-network endpoints in cloud, literal or resolved", async () => {
		const logProviderFetch = await loadFetch(true);
		mocks.lookup.mockResolvedValue([{ address: "10.0.5.20", family: 4 }]);

		for (const url of [
			"http://10.0.0.5:3100/ready",
			"http://127.0.0.1:3100/ready",
			"http://localhost:3100/ready",
			"http://[::1]:3100/ready",
			"http://0.0.0.0:3100/ready",
			"http://100.100.100.200/latest/meta-data/",
			"http://[::]:3100/ready",
			"http://loki.internal.example.com:3100/ready",
		]) {
			await expect(
				logProviderFetch(url),
				`expected ${url} to be rejected`,
			).rejects.toThrow(/blocked/i);
		}
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("allows a normal public endpoint", async () => {
		const logProviderFetch = await loadFetch(true);
		mocks.lookup.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);

		await logProviderFetch(
			"https://api.us-east-1.datadoghq.com/api/v1/validate",
		);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("does not follow redirects", async () => {
		const logProviderFetch = await loadFetch(false);
		mocks.lookup.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);

		await logProviderFetch("https://logs.example.com/ready");
		expect(global.fetch).toHaveBeenCalledWith(
			"https://logs.example.com/ready",
			expect.objectContaining({ redirect: "error" }),
		);
	});

	it("still calls fetch (letting it surface its own error) when DNS resolution fails", async () => {
		const logProviderFetch = await loadFetch(false);
		mocks.lookup.mockRejectedValue(new Error("ENOTFOUND"));

		await logProviderFetch("http://does-not-exist.invalid/");
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
