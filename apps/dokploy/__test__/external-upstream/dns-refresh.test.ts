import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	findServiceById: vi.fn(),
	findDomainById: vi.fn(),
	manageExternalUpstreamDomainLocked: vi.fn(),
	withExternalUpstreamConfigLock: vi.fn(),
	scheduleJob: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			externalUpstreams: {
				findMany: mocks.findMany,
				findFirst: mocks.findServiceById,
			},
			domains: { findFirst: mocks.findDomainById },
		},
	},
}));

vi.mock("@dokploy/server/services/project", () => ({
	validUniqueServerAppName: vi.fn(),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(),
}));

vi.mock("@dokploy/server/utils/traefik/external-upstream", () => ({
	manageExternalUpstreamDomainLocked: mocks.manageExternalUpstreamDomainLocked,
	withExternalUpstreamConfigLock: mocks.withExternalUpstreamConfigLock,
}));

vi.mock("node-schedule", () => ({
	scheduleJob: mocks.scheduleJob,
}));

const { initExternalUpstreamDnsRefresh, refreshExternalUpstreamDomains } =
	await import("@dokploy/server/services/external-upstream");

describe("external upstream DNS refresh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.withExternalUpstreamConfigLock.mockImplementation(
			(_service, operation) => operation(),
		);
	});

	it("reapplies every domain and continues when a refresh fails", async () => {
		const firstDomain = {
			domainId: "domain-1",
			host: "first.example.com",
			externalUpstreamId: "upstream-1",
		};
		const secondDomain = {
			domainId: "domain-2",
			host: "second.example.com",
			externalUpstreamId: "upstream-1",
		};
		const service = {
			externalUpstreamId: "upstream-1",
			appName: "upstream-1",
			targetUrl: "https://upstream.example.com",
			serverId: null,
			passHostHeader: true,
			domains: [firstDomain, secondDomain],
		};
		mocks.findMany.mockResolvedValue([service]);
		mocks.findServiceById.mockResolvedValue(service);
		mocks.findDomainById
			.mockResolvedValueOnce(firstDomain)
			.mockResolvedValueOnce(secondDomain);
		mocks.manageExternalUpstreamDomainLocked
			.mockRejectedValueOnce(new Error("DNS resolution failed"))
			.mockResolvedValueOnce(undefined);

		await refreshExternalUpstreamDomains();

		expect(mocks.findMany).toHaveBeenCalledWith({
			with: { domains: true },
		});
		expect(mocks.manageExternalUpstreamDomainLocked).toHaveBeenNthCalledWith(
			1,
			service,
			firstDomain,
		);
		expect(mocks.manageExternalUpstreamDomainLocked).toHaveBeenNthCalledWith(
			2,
			service,
			secondDomain,
		);
	});

	it("skips domains deleted while an earlier service is refreshing", async () => {
		const firstService = {
			externalUpstreamId: "upstream-1",
			appName: "upstream-1",
			domains: [{ domainId: "domain-1", host: "first.example.com" }],
		};
		const secondService = {
			externalUpstreamId: "upstream-2",
			appName: "upstream-2",
			domains: [{ domainId: "domain-2", host: "deleted.example.com" }],
		};
		let finishFirstRefresh = () => {};
		const firstRefresh = new Promise<void>((resolve) => {
			finishFirstRefresh = resolve;
		});

		mocks.findMany.mockResolvedValue([firstService, secondService]);
		mocks.findServiceById
			.mockResolvedValueOnce(firstService)
			.mockResolvedValueOnce(secondService);
		mocks.findDomainById
			.mockResolvedValueOnce(firstService.domains[0])
			.mockResolvedValueOnce(undefined);
		mocks.manageExternalUpstreamDomainLocked.mockReturnValueOnce(firstRefresh);

		const refresh = refreshExternalUpstreamDomains();
		await vi.waitFor(() =>
			expect(mocks.manageExternalUpstreamDomainLocked).toHaveBeenCalledTimes(1),
		);
		finishFirstRefresh();
		await refresh;

		expect(mocks.manageExternalUpstreamDomainLocked).toHaveBeenCalledTimes(1);
		expect(mocks.withExternalUpstreamConfigLock).toHaveBeenCalledTimes(2);
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
