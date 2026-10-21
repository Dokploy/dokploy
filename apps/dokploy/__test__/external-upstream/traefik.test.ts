import type { Domain } from "@dokploy/server/services/domain";
import type { FileConfig } from "@dokploy/server/utils/traefik/file-types";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	config: {
		http: { routers: {}, services: {}, middlewares: {}, serversTransports: {} },
	} as FileConfig,
	loadOrCreateConfig: vi.fn(),
	loadOrCreateConfigRemote: vi.fn(),
	writeTraefikConfig: vi.fn(),
	writeTraefikConfigRemote: vi.fn(),
	removeTraefikConfig: vi.fn(),
	removeTraefikConfigRemote: vi.fn(),
	createPathMiddlewares: vi.fn(),
	removePathMiddlewares: vi.fn(),
	getWebServerSettings: vi.fn(),
	lookup: vi.fn(),
}));

vi.mock("@dokploy/server/utils/traefik/application", () => ({
	loadOrCreateConfig: mocks.loadOrCreateConfig,
	loadOrCreateConfigRemote: mocks.loadOrCreateConfigRemote,
	removeTraefikConfig: mocks.removeTraefikConfig,
	removeTraefikConfigRemote: mocks.removeTraefikConfigRemote,
	writeTraefikConfig: mocks.writeTraefikConfig,
	writeTraefikConfigRemote: mocks.writeTraefikConfigRemote,
}));

vi.mock("@dokploy/server/utils/traefik/middleware", () => ({
	createPathMiddlewares: mocks.createPathMiddlewares,
	removePathMiddlewares: mocks.removePathMiddlewares,
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import { DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS } from "@dokploy/server/utils/network/external-upstream";
import { manageExternalUpstreamDomain } from "@dokploy/server/utils/traefik/external-upstream";

const service = {
	appName: "external-service",
	serverId: null,
	targetUrl: "https://upstream.example:8443/api",
	passHostHeader: false,
};

const domain = {
	domainId: "domain-1",
	host: "service.example.com",
	https: true,
	customEntrypoint: null,
	path: "/",
	port: 3000,
	serviceName: null,
	domainType: "externalUpstream",
	uniqueConfigKey: 7,
	createdAt: new Date().toISOString(),
	composeId: null,
	externalUpstreamId: "external-upstream-1",
	applicationId: null,
	previewDeploymentId: null,
	stripPath: false,
	internalPath: "/",
	middlewares: [],
	forwardAuthEnabled: false,
	enabled: true,
	certificateType: "none",
	customCertResolver: null,
} satisfies Domain;

const getLoadBalancer = (serviceName: string) => {
	const configuredService = mocks.config.http?.services?.[serviceName];
	return configuredService && "loadBalancer" in configuredService
		? configuredService.loadBalancer
		: undefined;
};

describe("external upstream Traefik configuration", () => {
	beforeEach(() => {
		mocks.config.http = {
			routers: {},
			services: {},
			middlewares: {},
			serversTransports: {},
		};
		mocks.getWebServerSettings.mockClear();
		mocks.loadOrCreateConfig.mockReturnValue(mocks.config);
		mocks.getWebServerSettings.mockResolvedValue({
			externalUpstreamBlockedCidrs: DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
		});
		mocks.lookup.mockReset();
		mocks.writeTraefikConfig.mockReset();
		mocks.writeTraefikConfigRemote.mockReset();
		mocks.createPathMiddlewares.mockReset();
	});

	test("pins public addresses and preserves upstream Host and TLS server name", async () => {
		mocks.lookup.mockResolvedValue([
			{ address: "93.184.216.34", family: 4 },
			{ address: "2001:4860:4860::8888", family: 6 },
		]);

		await manageExternalUpstreamDomain(service, domain);

		expect(getLoadBalancer("external-service-service-7")).toEqual({
			servers: [
				{ url: "https://93.184.216.34:8443/api" },
				{ url: "https://[2001:4860:4860::8888]:8443/api" },
			],
			passHostHeader: false,
			serversTransport: "external-service-servers-transport-7",
		});
		expect(
			mocks.config.http?.serversTransports?.[
				"external-service-servers-transport-7"
			],
		).toEqual({ serverName: "upstream.example" });
		expect(
			mocks.config.http?.middlewares?.["external-service-host-header-7"],
		).toEqual({
			headers: { customRequestHeaders: { Host: "upstream.example:8443" } },
		});
		expect(
			mocks.config.http?.routers?.["external-service-router-websecure-7"]
				?.middlewares,
		).toContain("external-service-host-header-7");
		expect(
			mocks.config.http?.routers?.["external-service-router-7"]?.middlewares,
		).toEqual(["redirect-to-https"]);
	});

	test("blocks a DNS rebind before writing Traefik configuration", async () => {
		mocks.lookup.mockResolvedValue([{ address: "10.0.0.10", family: 4 }]);

		await expect(manageExternalUpstreamDomain(service, domain)).rejects.toThrow(
			"Target URL points to a blocked network range",
		);
		expect(mocks.writeTraefikConfig).not.toHaveBeenCalled();
	});

	test("removes routing for a disabled domain without resolving its target", async () => {
		mocks.config.http!.routers!["external-service-router-7"] = {
			rule: "Host(`service.example.com`)",
			service: "external-service-service-7",
		};
		mocks.config.http!.services!["external-service-service-7"] = {
			loadBalancer: {
				servers: [{ url: "https://93.184.216.34:8443/api" }],
				passHostHeader: false,
			},
		};

		await manageExternalUpstreamDomain(service, { ...domain, enabled: false });

		expect(mocks.lookup).not.toHaveBeenCalled();
		expect(mocks.getWebServerSettings).not.toHaveBeenCalled();
		expect(mocks.config.http?.routers).toEqual({});
		expect(mocks.config.http?.services).toEqual({});
		expect(mocks.removeTraefikConfig).toHaveBeenCalledWith(service.appName);
		expect(mocks.removePathMiddlewares).toHaveBeenCalledWith(
			{ appName: service.appName, serverId: service.serverId },
			domain.uniqueConfigKey,
		);
	});

	test("keeps the client Host behavior when passHostHeader is enabled", async () => {
		mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

		await manageExternalUpstreamDomain(
			{ ...service, passHostHeader: true },
			{ ...domain, https: false },
		);

		expect(
			mocks.config.http?.routers?.["external-service-router-7"]?.middlewares,
		).toEqual([]);
		expect(mocks.config.http?.middlewares).toEqual({});
		expect(getLoadBalancer("external-service-service-7")).toMatchObject({
			passHostHeader: true,
		});
	});
});
