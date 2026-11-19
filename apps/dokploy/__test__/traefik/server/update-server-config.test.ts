import { join } from "node:path";
import { fs, vol } from "memfs";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

import type { FileConfig } from "@dokploy/server";
import {
	createDefaultServerTraefikConfig,
	loadOrCreateConfig,
	updateServerTraefik,
} from "@dokploy/server";
import { paths } from "@dokploy/server/constants";
import type { webServerSettings } from "@dokploy/server/db/schema";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stringify } from "yaml";

type WebServerSettings = typeof webServerSettings.$inferSelect;

const baseSettings: WebServerSettings = {
	id: "",
	https: false,
	certificateType: "none",
	host: null,
	serverIp: null,
	letsEncryptEmail: null,
	sshPrivateKey: null,
	enableDockerCleanup: false,
	telemetryProviderIds: [],
	vectorAgentOrganizationId: null,
	buildsConcurrency: 1,
	logCleanupCron: null,
	metricsConfig: {
		containers: {
			refreshRate: 20,
			services: {
				include: [],
				exclude: [],
			},
		},
		server: {
			type: "Dokploy",
			cronJob: "",
			port: 4500,
			refreshRate: 20,
			retentionDays: 2,
			token: "",
			thresholds: {
				cpu: 0,
				memory: 0,
			},
			urlCallback: "",
		},
	},
	whitelabelingConfig: {
		appName: null,
		appDescription: null,
		logoUrl: null,
		faviconUrl: null,
		customCss: null,
		loginLogoUrl: null,
		supportUrl: null,
		docsUrl: null,
		errorPageTitle: null,
		errorPageDescription: null,
		ogImageUrl: null,
		footerText: null,
		passwordResetGuide: null,
		supportEmail: null,
		logoLightUrl: null,
		loginLogoLightUrl: null,
		faviconLightUrl: null,
		dualModeBranding: false,
	},
	cleanupCacheApplications: false,
	cleanupCacheOnCompose: false,
	cleanupCacheOnPreviews: false,
	remoteServersOnly: false,
	enforceSSO: false,
	createdAt: null,
	updatedAt: new Date(),
};

beforeEach(() => {
	vol.reset();
	createDefaultServerTraefikConfig();
});

test("Should read the configuration file", () => {
	const config: FileConfig = loadOrCreateConfig("dokploy");
	expect(config.http?.routers?.["dokploy-router-app"]?.service).toBe(
		"dokploy-service-app",
	);
});

test("Should apply redirect-to-https", () => {
	updateServerTraefik(
		{
			...baseSettings,
			https: true,
			certificateType: "letsencrypt",
		},
		"example.com",
	);

	const config: FileConfig = loadOrCreateConfig("dokploy");

	expect(config.http?.routers?.["dokploy-router-app"]?.middlewares).toContain(
		"redirect-to-https",
	);
});

test("Should change only host when no certificate", () => {
	updateServerTraefik(baseSettings, "example.com");

	const config: FileConfig = loadOrCreateConfig("dokploy");

	expect(config.http?.routers?.["dokploy-router-app-secure"]).toBeUndefined();
});

test("Should not touch config without host", () => {
	const originalConfig: FileConfig = loadOrCreateConfig("dokploy");

	updateServerTraefik(baseSettings, null);

	const config: FileConfig = loadOrCreateConfig("dokploy");

	expect(originalConfig).toEqual(config);
});

test("Should remove websecure if https rollback to http", () => {
	updateServerTraefik(
		{ ...baseSettings, certificateType: "letsencrypt" },
		"example.com",
	);

	updateServerTraefik(
		{ ...baseSettings, certificateType: "none" },
		"example.com",
	);

	const config: FileConfig = loadOrCreateConfig("dokploy");

	expect(config.http?.routers?.["dokploy-router-app-secure"]).toBeUndefined();
	expect(
		config.http?.routers?.["dokploy-router-app"]?.middlewares,
	).not.toContain("redirect-to-https");
});

describe("default dokploy.docker.localhost router (#5036)", () => {
	// paths() depends on NODE_ENV.
	const dynamicPath = () => paths().DYNAMIC_TRAEFIK_PATH;
	const configPath = () => join(dynamicPath(), "dokploy.yml");
	const defaultRouter = {
		rule: "Host(`dokploy.docker.localhost`) && PathPrefix(`/`)",
		service: "dokploy-service-app",
		entryPoints: ["web"],
	};
	const service = {
		loadBalancer: {
			servers: [{ url: "http://dokploy:3000" }],
			passHostHeader: true,
		},
	};
	const writeExisting = (routers: Record<string, unknown>) => {
		vol.reset();
		vol.mkdirSync(dynamicPath(), { recursive: true });
		vol.writeFileSync(
			configPath(),
			stringify({
				http: { routers, services: { "dokploy-service-app": service } },
			}),
		);
	};

	beforeEach(() => {
		vi.stubEnv("NODE_ENV", "production");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("New install has no router but keeps the service", () => {
		vol.reset();
		createDefaultServerTraefikConfig();

		const config: FileConfig = loadOrCreateConfig("dokploy");
		expect(config.http?.routers).toEqual({});
		expect(config.http?.services?.["dokploy-service-app"]).toEqual(service);
	});

	test("Setting a panel domain on a new install creates the router", () => {
		vol.reset();
		createDefaultServerTraefikConfig();
		updateServerTraefik(baseSettings, "example.com");

		const config: FileConfig = loadOrCreateConfig("dokploy");
		expect(config.http?.routers?.["dokploy-router-app"]).toMatchObject({
			rule: "Host(`example.com`)",
			service: "dokploy-service-app",
			entryPoints: ["web"],
		});
	});

	test("Removes the untouched default router from an existing install", () => {
		writeExisting({ "dokploy-router-app": defaultRouter });
		createDefaultServerTraefikConfig();

		const config: FileConfig = loadOrCreateConfig("dokploy");
		expect(config.http?.routers?.["dokploy-router-app"]).toBeUndefined();
		expect(config.http?.services?.["dokploy-service-app"]).toEqual(service);
	});

	test("Keeps a router with a panel domain", () => {
		const domainRouter = { ...defaultRouter, rule: "Host(`example.com`)" };
		writeExisting({ "dokploy-router-app": domainRouter });
		createDefaultServerTraefikConfig();

		const config: FileConfig = loadOrCreateConfig("dokploy");
		expect(config.http?.routers?.["dokploy-router-app"]).toEqual(domainRouter);
	});

	test("Keeps a default router the user edited", () => {
		const edited = { ...defaultRouter, middlewares: ["basic-auth"] };
		writeExisting({ "dokploy-router-app": edited });
		createDefaultServerTraefikConfig();

		const config: FileConfig = loadOrCreateConfig("dokploy");
		expect(config.http?.routers?.["dokploy-router-app"]).toEqual(edited);
	});

	test("Leaves malformed YAML untouched without throwing", () => {
		vol.reset();
		vol.mkdirSync(dynamicPath(), { recursive: true });
		vol.writeFileSync(configPath(), "http: [unclosed");

		expect(() => createDefaultServerTraefikConfig()).not.toThrow();
		expect(vol.readFileSync(configPath(), "utf8")).toBe("http: [unclosed");
	});

	test("Leaves the default router alone outside production", () => {
		vi.stubEnv("NODE_ENV", "development");
		writeExisting({ "dokploy-router-app": defaultRouter });
		createDefaultServerTraefikConfig();

		const config: FileConfig = loadOrCreateConfig("dokploy");
		expect(config.http?.routers?.["dokploy-router-app"]).toEqual(defaultRouter);
	});
});
