import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	lookup: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
	lookup: mocks.lookup,
}));

const { logProviderFetch } = await import(
	"@dokploy/server/services/log-management/types"
);

describe("logProviderFetch — metadata endpoint guard", () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		mocks.lookup.mockReset();
		global.fetch = vi.fn().mockResolvedValue(new Response("ok"));
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("rejects a literal AWS/GCP/Azure metadata IP without ever calling fetch", async () => {
		await expect(
			logProviderFetch("http://169.254.169.254/latest/meta-data/"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
		expect(mocks.lookup).not.toHaveBeenCalled();
	});

	it("rejects the AWS ECS metadata IPv6 address", async () => {
		await expect(
			logProviderFetch("http://[fd00:ec2::254]/v2/credentials"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("rejects every fe80::/10 link-local address, not just literal fe80: ones", async () => {
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

	it("rejects the GCP metadata hostname without needing DNS resolution", async () => {
		await expect(
			logProviderFetch("http://metadata.google.internal/computeMetadata/v1/"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
		expect(mocks.lookup).not.toHaveBeenCalled();
	});

	it("rejects a hostname whose DNS record resolves to a metadata address", async () => {
		mocks.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

		await expect(
			logProviderFetch("http://attacker-controlled.example.com/"),
		).rejects.toThrow(/metadata/i);
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("allows a private-network endpoint (self-hosted Loki behind a VPN, say)", async () => {
		mocks.lookup.mockResolvedValue([{ address: "10.0.5.20", family: 4 }]);

		await logProviderFetch("http://loki.internal.example.com:3100/ready");
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("allows a normal public endpoint", async () => {
		mocks.lookup.mockResolvedValue([{ address: "203.0.113.10", family: 4 }]);

		await logProviderFetch(
			"https://api.us-east-1.datadoghq.com/api/v1/validate",
		);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("still calls fetch (letting it surface its own error) when DNS resolution fails", async () => {
		mocks.lookup.mockRejectedValue(new Error("ENOTFOUND"));

		await logProviderFetch("http://does-not-exist.invalid/");
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
