import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	manageExternalUpstreamDomain: vi.fn(),
	scheduleJob: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { externalUpstreams: { findMany: mocks.findMany } } },
}));

vi.mock("@dokploy/server/services/project", () => ({
	validUniqueServerAppName: vi.fn(),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(),
}));

vi.mock("@dokploy/server/utils/traefik/external-upstream", () => ({
	manageExternalUpstreamDomain: mocks.manageExternalUpstreamDomain,
}));

vi.mock("node-schedule", () => ({
	scheduleJob: mocks.scheduleJob,
}));

const {
	initExternalUpstreamDnsRefresh,
	refreshExternalUpstreamDomains,
} = await import("@dokploy/server/services/external-upstream");

describe("external upstream DNS refresh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("reapplies every domain and continues when a refresh fails", async () => {
		const firstDomain = { domainId: "domain-1", host: "first.example.com" };
		const secondDomain = { domainId: "domain-2", host: "second.example.com" };
		const service = {
			externalUpstreamId: "upstream-1",
			appName: "upstream-1",
			targetUrl: "https://upstream.example.com",
			serverId: null,
			passHostHeader: true,
			domains: [firstDomain, secondDomain],
		};
		mocks.findMany.mockResolvedValue([service]);
		mocks.manageExternalUpstreamDomain
			.mockRejectedValueOnce(new Error("DNS resolution failed"))
			.mockResolvedValueOnce(undefined);

		await refreshExternalUpstreamDomains();

		expect(mocks.findMany).toHaveBeenCalledWith({
			with: { domains: true },
		});
		expect(mocks.manageExternalUpstreamDomain).toHaveBeenNthCalledWith(
			1,
			service,
			firstDomain,
		);
		expect(mocks.manageExternalUpstreamDomain).toHaveBeenNthCalledWith(
			2,
			service,
			secondDomain,
		);
	});

	it("schedules periodic refreshes and runs once during startup", async () => {
		mocks.findMany.mockResolvedValue([]);

		initExternalUpstreamDnsRefresh();

		expect(mocks.scheduleJob).toHaveBeenCalledWith(
			"external-upstream-dns-refresh",
			"*/5 * * * *",
			expect.any(Function),
		);
		await vi.waitFor(() => expect(mocks.findMany).toHaveBeenCalledTimes(1));
	});
});
