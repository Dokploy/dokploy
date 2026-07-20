import { beforeEach, expect, test, vi } from "vitest";

const txInsertMock = vi.hoisted(() => vi.fn());
const txValuesMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const dbDeleteMock = vi.hoisted(() => vi.fn());
const domainsFindFirstMock = vi.hoisted(() => vi.fn());
const domainsFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: transactionMock,
		query: {
			domains: {
				findFirst: domainsFindFirstMock,
				findMany: domainsFindManyMock,
			},
		},
		delete: dbDeleteMock,
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
}));

vi.mock("@dokploy/server/utils/web-server/domain", () => ({
	manageWebServerDomain: vi.fn(),
}));

vi.mock("@dokploy/server/utils/docker/domain", () => ({
	getCaddyComposeRouteTargetsForWebServer: vi.fn(),
	writeCaddyComposeRoutesForTargets: vi.fn(),
}));

import { findApplicationById } from "@dokploy/server/services/application";
import {
	createComposeDomain,
	createDomain,
	removeComposeDomainsForWebServer,
} from "@dokploy/server/services/domain";
import {
	getCaddyComposeRouteTargetsForWebServer,
	writeCaddyComposeRoutesForTargets,
} from "@dokploy/server/utils/docker/domain";
import { manageWebServerDomain } from "@dokploy/server/utils/web-server/domain";

const domain = {
	domainId: "domain-1",
	applicationId: "app-1",
	composeId: null,
	previewDeploymentId: null,
	host: "example.com",
	uniqueConfigKey: 7,
};

const composeDomain = {
	...domain,
	applicationId: null,
	composeId: "compose-1",
	domainType: "compose",
};

const retainedComposeDomain = {
	...composeDomain,
	domainId: "domain-2",
	host: "retained.example.com",
	uniqueConfigKey: 8,
};

const application = {
	applicationId: "app-1",
	appName: "my-app",
	serverId: null,
};

beforeEach(() => {
	vi.clearAllMocks();
	txInsertMock.mockReturnValue({
		values: txValuesMock.mockReturnValue({
			returning: vi.fn().mockResolvedValue([domain]),
		}),
	});
	transactionMock.mockImplementation(async (callback) => {
		const tx = { delete: dbDeleteMock, insert: txInsertMock };
		return callback(tx);
	});
	domainsFindFirstMock.mockResolvedValue(domain);
	domainsFindManyMock.mockResolvedValue([composeDomain]);
	dbDeleteMock.mockReturnValue({
		where: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([composeDomain]),
		}),
	});
	vi.mocked(getCaddyComposeRouteTargetsForWebServer).mockResolvedValue([
		{},
	] as never);
	vi.mocked(writeCaddyComposeRoutesForTargets).mockResolvedValue(
		undefined as never,
	);
	vi.mocked(findApplicationById).mockResolvedValue(application as never);
});

test("creates copied new-service application domains through the active web server provider", async () => {
	vi.mocked(manageWebServerDomain).mockResolvedValue(undefined as never);

	const created = await createDomain({
		host: " example.com ",
		applicationId: "app-1",
		domainType: "application",
	} as never);

	expect(created).toBe(domain);
	expect(txInsertMock).toHaveBeenCalled();
	expect(manageWebServerDomain).toHaveBeenCalledWith(application, domain);
});

test("uses the existing application domain port when a new application domain omits port", async () => {
	const existingDomain = {
		...domain,
		domainId: "domain-existing",
		host: "current.example.com",
		port: 80,
		uniqueConfigKey: 1,
	};
	const createdDomain = {
		...domain,
		host: "new.example.com",
		port: 80,
		uniqueConfigKey: 9,
	};
	domainsFindManyMock.mockResolvedValueOnce([existingDomain]);
	txValuesMock.mockReturnValueOnce({
		returning: vi.fn().mockResolvedValue([createdDomain]),
	});
	vi.mocked(manageWebServerDomain).mockResolvedValue(undefined as never);

	const created = await createDomain({
		host: " new.example.com ",
		applicationId: "app-1",
		domainType: "application",
	} as never);

	expect(created).toBe(createdDomain);
	expect(txValuesMock).toHaveBeenCalledWith(
		expect.objectContaining({
			host: "new.example.com",
			port: 80,
		}),
	);
	expect(manageWebServerDomain).toHaveBeenCalledWith(
		application,
		createdDomain,
	);
});

test("preserves an explicit application domain port", async () => {
	const existingDomain = {
		...domain,
		domainId: "domain-existing",
		host: "current.example.com",
		port: 80,
		uniqueConfigKey: 1,
	};
	const createdDomain = {
		...domain,
		host: "api.example.com",
		port: 8080,
		uniqueConfigKey: 9,
	};
	domainsFindManyMock.mockResolvedValueOnce([existingDomain]);
	txValuesMock.mockReturnValueOnce({
		returning: vi.fn().mockResolvedValue([createdDomain]),
	});
	vi.mocked(manageWebServerDomain).mockResolvedValue(undefined as never);

	await createDomain({
		host: "api.example.com",
		applicationId: "app-1",
		domainType: "application",
		port: 8080,
	} as never);

	expect(txValuesMock).toHaveBeenCalledWith(
		expect.objectContaining({
			host: "api.example.com",
			port: 8080,
		}),
	);
});

test("does not infer application domain ports for compose domains", async () => {
	txValuesMock.mockReturnValueOnce({
		returning: vi.fn().mockResolvedValue([composeDomain]),
	});
	vi.mocked(manageWebServerDomain).mockResolvedValue(undefined as never);

	await createDomain({
		host: "compose.example.com",
		composeId: "compose-1",
		domainType: "compose",
	} as never);

	expect(txValuesMock).toHaveBeenCalledWith(
		expect.not.objectContaining({
			port: 80,
		}),
	);
});

test("removes application domain rows when provider route creation fails", async () => {
	vi.mocked(manageWebServerDomain).mockRejectedValueOnce(
		new Error("caddy reload failed") as never,
	);

	await expect(
		createDomain({
			host: "example.com",
			applicationId: "app-1",
			domainType: "application",
		} as never),
	).rejects.toThrow("caddy reload failed");

	expect(manageWebServerDomain).toHaveBeenCalledWith(application, domain);
	expect(dbDeleteMock).toHaveBeenCalled();
});

test("removes compose domain rows when Caddy compose route refresh fails after creation", async () => {
	txInsertMock.mockReturnValueOnce({
		values: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([composeDomain]),
		}),
	});
	vi.mocked(writeCaddyComposeRoutesForTargets)
		.mockRejectedValueOnce(new Error("caddy refresh failed") as never)
		.mockResolvedValueOnce(undefined as never);

	await expect(
		createComposeDomain(
			{
				composeId: "compose-1",
				appName: "my-compose",
				serverId: null,
			} as never,
			{
				host: "example.com",
				composeId: "compose-1",
				domainType: "compose",
			} as never,
			"caddy",
		),
	).rejects.toThrow("caddy refresh failed");

	expect(dbDeleteMock).toHaveBeenCalled();
	expect(writeCaddyComposeRoutesForTargets).toHaveBeenCalledTimes(2);
});

test("refreshes Caddy compose routes with zero remaining domains before deleting imported template domains", async () => {
	domainsFindManyMock.mockResolvedValueOnce([composeDomain]);

	const removed = await removeComposeDomainsForWebServer(
		{
			composeId: "compose-1",
			appName: "my-compose",
			serverId: null,
		} as never,
		[composeDomain] as never,
		"caddy",
	);

	expect(removed).toEqual([composeDomain]);
	expect(getCaddyComposeRouteTargetsForWebServer).toHaveBeenCalledWith(
		expect.objectContaining({ composeId: "compose-1" }),
		[],
		"caddy",
	);
	expect(dbDeleteMock).toHaveBeenCalled();
	expect(writeCaddyComposeRoutesForTargets).toHaveBeenCalledTimes(1);
});

test("restores Caddy compose routes if imported template domain deletion fails", async () => {
	domainsFindManyMock.mockResolvedValueOnce([
		composeDomain,
		retainedComposeDomain,
	]);
	dbDeleteMock.mockReturnValueOnce({
		where: vi.fn().mockReturnValue({
			returning: vi.fn().mockRejectedValue(new Error("db delete failed")),
		}),
	});

	await expect(
		removeComposeDomainsForWebServer(
			{
				composeId: "compose-1",
				appName: "my-compose",
				serverId: null,
			} as never,
			[composeDomain] as never,
			"caddy",
		),
	).rejects.toThrow("db delete failed");

	expect(getCaddyComposeRouteTargetsForWebServer).toHaveBeenNthCalledWith(
		1,
		expect.objectContaining({ composeId: "compose-1" }),
		[retainedComposeDomain],
		"caddy",
	);
	expect(getCaddyComposeRouteTargetsForWebServer).toHaveBeenNthCalledWith(
		2,
		expect.objectContaining({ composeId: "compose-1" }),
		[composeDomain, retainedComposeDomain],
		"caddy",
	);
	expect(writeCaddyComposeRoutesForTargets).toHaveBeenCalledTimes(2);
});

test("deletes imported template compose domains without Caddy refresh under Traefik", async () => {
	domainsFindManyMock.mockResolvedValueOnce([composeDomain]);

	await removeComposeDomainsForWebServer(
		{
			composeId: "compose-1",
			appName: "my-compose",
			serverId: null,
		} as never,
		[composeDomain] as never,
		"traefik",
	);

	expect(getCaddyComposeRouteTargetsForWebServer).not.toHaveBeenCalled();
	expect(writeCaddyComposeRoutesForTargets).not.toHaveBeenCalled();
	expect(dbDeleteMock).toHaveBeenCalled();
});
