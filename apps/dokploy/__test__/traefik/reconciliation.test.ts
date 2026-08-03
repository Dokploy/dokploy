import type { Domain, FileConfig } from "@dokploy/server";
import {
	initDomainTlsReconciliation,
	routerNeedsTlsFix,
} from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findDomainsNeedingTlsReconciliationMock = vi.fn();
vi.mock("@dokploy/server/services/domain", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/domain")
	>("@dokploy/server/services/domain");
	return {
		...actual,
		findDomainsNeedingTlsReconciliation: () =>
			findDomainsNeedingTlsReconciliationMock(),
	};
});

const findApplicationByIdMock = vi.fn();
vi.mock("@dokploy/server/services/application", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/application")
	>("@dokploy/server/services/application");
	return {
		...actual,
		findApplicationById: (applicationId: string) =>
			findApplicationByIdMock(applicationId),
	};
});

const reloadDockerResourceMock = vi.fn();
vi.mock("@dokploy/server/services/settings", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/services/settings")
	>("@dokploy/server/services/settings");
	return {
		...actual,
		reloadDockerResource: (resourceName: string, serverId?: string) =>
			reloadDockerResourceMock(resourceName, serverId),
	};
});

const purgeAcmeCertificatesMock = vi.fn();
vi.mock("@dokploy/server/utils/traefik/acme", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/traefik/acme")
	>("@dokploy/server/utils/traefik/acme");
	return {
		...actual,
		purgeAcmeCertificates: (hosts: string[], serverId?: string | null) =>
			purgeAcmeCertificatesMock(hosts, serverId),
	};
});

const loadOrCreateConfigMock = vi.fn();
const loadOrCreateConfigRemoteMock = vi.fn();
vi.mock("@dokploy/server/utils/traefik/application", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/traefik/application")
	>("@dokploy/server/utils/traefik/application");
	return {
		...actual,
		loadOrCreateConfig: (appName: string) => loadOrCreateConfigMock(appName),
		loadOrCreateConfigRemote: (serverId: string, appName: string) =>
			loadOrCreateConfigRemoteMock(serverId, appName),
	};
});

const manageDomainMock = vi.fn();
vi.mock("@dokploy/server/utils/traefik/domain", async () => {
	const actual = await vi.importActual<
		typeof import("@dokploy/server/utils/traefik/domain")
	>("@dokploy/server/utils/traefik/domain");
	return {
		...actual,
		manageDomain: (app: unknown, domain: unknown) =>
			manageDomainMock(app, domain),
	};
});

const configWithRouter = (
	tls: Record<string, unknown> | undefined,
): FileConfig => ({
	http: {
		routers: {
			"my-app-router-websecure-1": {
				rule: "Host(`example.com`)",
				service: "my-app-service-1",
				entryPoints: ["websecure"],
				...(tls === undefined ? {} : { tls }),
			},
		},
		services: {},
	},
});

describe("routerNeedsTlsFix", () => {
	it("is true when the websecure router has no tls key", () => {
		expect(routerNeedsTlsFix(configWithRouter(undefined), "my-app", 1)).toBe(
			true,
		);
	});

	it("is false when the router already has an empty tls block", () => {
		expect(routerNeedsTlsFix(configWithRouter({}), "my-app", 1)).toBe(false);
	});

	it("is false when the router has a cert resolver", () => {
		expect(
			routerNeedsTlsFix(
				configWithRouter({ certResolver: "letsencrypt" }),
				"my-app",
				1,
			),
		).toBe(false);
	});

	it("is false when the router does not exist", () => {
		expect(routerNeedsTlsFix(configWithRouter(undefined), "other-app", 1)).toBe(
			false,
		);
	});

	it("is false for an empty config", () => {
		expect(routerNeedsTlsFix({}, "my-app", 1)).toBe(false);
	});
});

const buildDomain = (overrides: Partial<Domain>): Domain =>
	({
		domainId: overrides.host ?? "domain-id",
		host: "example.com",
		https: false,
		port: 3000,
		customEntrypoint: null,
		path: "/",
		serviceName: null,
		domainType: "application",
		uniqueConfigKey: 1,
		createdAt: new Date().toISOString(),
		composeId: null,
		customCertResolver: null,
		applicationId: "app-1",
		previewDeploymentId: null,
		certificateType: "none",
		internalPath: "/",
		stripPath: false,
		middlewares: [],
		forwardAuthEnabled: false,
		...overrides,
	}) as Domain;

const routerConfigFor = (
	appName: string,
	keys: number[],
	tlsByKey: Record<number, Record<string, unknown> | undefined>,
): FileConfig => ({
	http: {
		routers: Object.fromEntries(
			keys.map((key) => [
				`${appName}-router-websecure-${key}`,
				{
					rule: "Host(`example.com`)",
					service: `${appName}-service-${key}`,
					entryPoints: ["websecure"],
					...(tlsByKey[key] === undefined ? {} : { tls: tlsByKey[key] }),
				},
			]),
		),
		services: {},
	},
});

describe("initDomainTlsReconciliation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	it("skips applications already fixed, regenerates once per stale domain but loads config once per app, reloads at most once per server only when a certificate was removed, and isolates a failing application from the rest", async () => {
		// app-1: local, two stale domains sharing one router config load.
		const appOneDomainA = buildDomain({
			domainId: "a1",
			host: "a1.example.com",
			applicationId: "app-1",
			uniqueConfigKey: 1,
		});
		const appOneDomainB = buildDomain({
			domainId: "a2",
			host: "a2.example.com",
			applicationId: "app-1",
			uniqueConfigKey: 2,
		});
		// app-2: local, router already carries `tls: {}` -> nothing to do.
		const appTwoDomain = buildDomain({
			domainId: "b1",
			host: "b1.example.com",
			applicationId: "app-2",
			uniqueConfigKey: 1,
		});
		// app-3: remote, config load throws -> must not block the others.
		const appThreeDomain = buildDomain({
			domainId: "c1",
			host: "c1.example.com",
			applicationId: "app-3",
			uniqueConfigKey: 1,
		});
		// app-4: remote, one stale domain but no certificate actually removed.
		const appFourDomain = buildDomain({
			domainId: "d1",
			host: "d1.example.com",
			applicationId: "app-4",
			uniqueConfigKey: 1,
		});

		findDomainsNeedingTlsReconciliationMock.mockResolvedValue([
			appThreeDomain,
			appOneDomainA,
			appOneDomainB,
			appTwoDomain,
			appFourDomain,
		]);

		const applicationsById: Record<string, unknown> = {
			"app-1": { applicationId: "app-1", appName: "app-one", serverId: null },
			"app-2": { applicationId: "app-2", appName: "app-two", serverId: null },
			"app-3": {
				applicationId: "app-3",
				appName: "app-three",
				serverId: "server-x",
			},
			"app-4": {
				applicationId: "app-4",
				appName: "app-four",
				serverId: "server-y",
			},
		};
		findApplicationByIdMock.mockImplementation(
			async (applicationId: string) => applicationsById[applicationId],
		);

		loadOrCreateConfigMock.mockImplementation((appName: string) => {
			if (appName === "app-one") {
				return routerConfigFor("app-one", [1, 2], {
					1: undefined,
					2: undefined,
				});
			}
			if (appName === "app-two") {
				return routerConfigFor("app-two", [1], { 1: {} });
			}
			throw new Error(`unexpected local config load for ${appName}`);
		});

		loadOrCreateConfigRemoteMock.mockImplementation(
			async (_serverId: string, appName: string) => {
				if (appName === "app-three") {
					throw new Error("ssh connection refused");
				}
				if (appName === "app-four") {
					return routerConfigFor("app-four", [1], { 1: undefined });
				}
				throw new Error(`unexpected remote config load for ${appName}`);
			},
		);

		manageDomainMock.mockResolvedValue(undefined);

		purgeAcmeCertificatesMock.mockImplementation(
			async (hosts: string[], serverId?: string | null) => {
				// app-4's server reports nothing was actually removed.
				if (serverId === "server-y") return [];
				return hosts;
			},
		);

		reloadDockerResourceMock.mockResolvedValue(undefined);

		await initDomainTlsReconciliation();

		// (a) app-2's router already has `tls: {}` -> zero regeneration calls for it.
		const manageDomainHosts = manageDomainMock.mock.calls.map(
			(call) => (call[1] as Domain).host,
		);
		expect(manageDomainHosts).not.toContain("b1.example.com");

		// (b) app-1 has two stale domains -> regeneration invoked once per
		// stale domain, but the config is loaded only once for that app.
		expect(manageDomainHosts.filter((h) => h.startsWith("a"))).toEqual([
			"a1.example.com",
			"a2.example.com",
		]);
		expect(
			loadOrCreateConfigMock.mock.calls.filter((call) => call[0] === "app-one"),
		).toHaveLength(1);

		// isolation: app-3 threw while loading its config, but app-1 (and
		// app-4) were still processed and app-3 never reached manageDomain.
		expect(manageDomainHosts).not.toContain("c1.example.com");
		expect(manageDomainHosts).toContain("d1.example.com");

		// reload: requested at most once per server, only when a
		// certificate was actually removed. app-1 (local, serverId
		// undefined) had removals -> one reload. app-4's server reported no
		// removals -> no reload for "server-y".
		expect(reloadDockerResourceMock).toHaveBeenCalledTimes(1);
		expect(reloadDockerResourceMock).toHaveBeenCalledWith(
			"dokploy-traefik",
			undefined,
		);
		expect(reloadDockerResourceMock).not.toHaveBeenCalledWith(
			"dokploy-traefik",
			"server-y",
		);
	});
});
