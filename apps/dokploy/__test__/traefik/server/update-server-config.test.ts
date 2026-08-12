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
import type { webServerSettings } from "@dokploy/server/db/schema";
import { beforeEach, expect, test, vi } from "vitest";

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
		metaTitle: null,
		footerText: null,
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
	expect(config.http?.routers?.["dokploy-router-app"]?.middlewares).toEqual([
		"dokploy-local-access",
	]);
	expect(config.http?.middlewares?.["dokploy-local-access"]).toEqual({
		ipAllowList: {
			sourceRange: [
				"127.0.0.1/32",
				"10.0.0.0/8",
				"172.16.0.0/12",
				"192.168.0.0/16",
			],
		},
	});
});

test("Should migrate existing configuration with the local-access allowlist", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic", { recursive: true });
	fs.writeFileSync(
		".docker/traefik/dynamic/dokploy.yml",
		`http:
  routers:
    dokploy-router-app:
      rule: Host(\`dokploy.docker.localhost\`) && PathPrefix(\`/\`)
      service: dokploy-service-app
      entryPoints:
        - web
    custom-router:
      rule: Host(\`custom.example.com\`)
      service: custom-service
  middlewares:
    custom-middleware:
      headers:
        customRequestHeaders:
          X-Test: preserved
  services:
    dokploy-service-app:
      loadBalancer:
        servers:
          - url: http://dokploy:3000
    custom-service:
      loadBalancer:
        servers:
          - url: http://custom:3000
`,
	);

	createDefaultServerTraefikConfig();

	const config: FileConfig = loadOrCreateConfig("dokploy");
	expect(config.http?.routers?.["dokploy-router-app"]?.middlewares).toEqual([
		"dokploy-local-access",
	]);
	expect(config.http?.middlewares?.["dokploy-local-access"]).toEqual({
		ipAllowList: {
			sourceRange: [
				"127.0.0.1/32",
				"10.0.0.0/8",
				"172.16.0.0/12",
				"192.168.0.0/16",
			],
		},
	});
	expect(config.http?.routers?.["custom-router"]?.service).toBe(
		"custom-service",
	);
	expect(config.http?.middlewares?.["custom-middleware"]).toBeDefined();
});

test("Should reconcile an ineffective local-access middleware", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic", { recursive: true });
	fs.writeFileSync(
		".docker/traefik/dynamic/dokploy.yml",
		`http:
  routers:
    dokploy-router-app:
      rule: Host(\`dokploy.docker.localhost\`) && PathPrefix(\`/\`)
      service: dokploy-service-app
      entryPoints:
        - web
      middlewares:
        - dokploy-local-access
  middlewares:
    dokploy-local-access:
      headers:
        customRequestHeaders:
          X-Test: ineffective
`,
	);

	createDefaultServerTraefikConfig();

	const config: FileConfig = loadOrCreateConfig("dokploy");
	expect(config.http?.routers?.["dokploy-router-app"]?.middlewares).toEqual([
		"dokploy-local-access",
	]);
	expect(config.http?.middlewares?.["dokploy-local-access"]).toEqual({
		ipAllowList: {
			sourceRange: [
				"127.0.0.1/32",
				"10.0.0.0/8",
				"172.16.0.0/12",
				"192.168.0.0/16",
			],
		},
	});
});

test("Should reconcile the fallback host configured through server settings", () => {
	updateServerTraefik(
		{
			...baseSettings,
			https: true,
			certificateType: "letsencrypt",
		},
		"dokploy.docker.localhost",
	);

	createDefaultServerTraefikConfig();

	const config: FileConfig = loadOrCreateConfig("dokploy");
	expect(config.http?.routers?.["dokploy-router-app"]?.middlewares).toEqual([
		"redirect-to-https",
		"dokploy-local-access",
	]);
	expect(
		config.http?.routers?.["dokploy-router-app-secure"]?.middlewares,
	).toEqual(["dokploy-local-access"]);
});

test("Should not migrate the local-access allowlist for a custom domain", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic", { recursive: true });
	fs.writeFileSync(
		".docker/traefik/dynamic/dokploy.yml",
		`http:
  routers:
    dokploy-router-app:
      rule: Host(\`dash.example.com\`)
      service: dokploy-service-app
      entryPoints:
        - web
      middlewares:
        - redirect-to-https
  services:
    dokploy-service-app:
      loadBalancer:
        servers:
          - url: http://dokploy:3000
`,
	);

	createDefaultServerTraefikConfig();

	const config: FileConfig = loadOrCreateConfig("dokploy");
	expect(config.http?.routers?.["dokploy-router-app"]).toEqual({
		rule: "Host(`dash.example.com`)",
		service: "dokploy-service-app",
		entryPoints: ["web"],
		middlewares: ["redirect-to-https"],
	});
	expect(config.http?.middlewares?.["dokploy-local-access"]).toBeUndefined();
});

test("Should skip malformed default traefik configuration", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic", { recursive: true });
	const malformedConfig = "http:\n  routers: [\n";
	fs.writeFileSync(".docker/traefik/dynamic/dokploy.yml", malformedConfig);

	expect(() => createDefaultServerTraefikConfig()).not.toThrow();
	expect(fs.readFileSync(".docker/traefik/dynamic/dokploy.yml", "utf8")).toBe(
		malformedConfig,
	);
});

test("Should skip a configuration without HTTP routers", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic", { recursive: true });
	const configWithoutHttp = "tcp:\n  routers: {}\n";
	fs.writeFileSync(".docker/traefik/dynamic/dokploy.yml", configWithoutHttp);

	expect(() => createDefaultServerTraefikConfig()).not.toThrow();
	expect(fs.readFileSync(".docker/traefik/dynamic/dokploy.yml", "utf8")).toBe(
		configWithoutHttp,
	);
});

test("Should skip a configuration with HTTP but no routers", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic", { recursive: true });
	const configWithoutRouters = "http:\n  services: {}\n";
	fs.writeFileSync(".docker/traefik/dynamic/dokploy.yml", configWithoutRouters);

	expect(() => createDefaultServerTraefikConfig()).not.toThrow();
	expect(fs.readFileSync(".docker/traefik/dynamic/dokploy.yml", "utf8")).toBe(
		configWithoutRouters,
	);
});

test("Should migrate a default router without an HTTP middleware map", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic", { recursive: true });
	fs.writeFileSync(
		".docker/traefik/dynamic/dokploy.yml",
		`http:
  routers:
    dokploy-router-app:
      rule: Host(\`dokploy.docker.localhost\`) && PathPrefix(\`/\`)
      service: dokploy-service-app
      entryPoints:
        - web
`,
	);

	createDefaultServerTraefikConfig();

	const config: FileConfig = loadOrCreateConfig("dokploy");
	expect(config.http?.routers?.["dokploy-router-app"]?.middlewares).toEqual([
		"dokploy-local-access",
	]);
	expect(config.http?.middlewares?.["dokploy-local-access"]).toBeDefined();
});

test("Should skip a configuration with a malformed HTTP middleware map", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic", { recursive: true });
	const malformedMiddlewares = `http:
  routers:
    dokploy-router-app:
      rule: Host(\`dokploy.docker.localhost\`) && PathPrefix(\`/\`)
      service: dokploy-service-app
      entryPoints:
        - web
  middlewares: redirect-to-https
`;
	fs.writeFileSync(".docker/traefik/dynamic/dokploy.yml", malformedMiddlewares);

	expect(() => createDefaultServerTraefikConfig()).not.toThrow();
	expect(fs.readFileSync(".docker/traefik/dynamic/dokploy.yml", "utf8")).toBe(
		malformedMiddlewares,
	);
});

test("Should skip a default router with malformed middlewares", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic", { recursive: true });
	const malformedMiddlewares = `http:
  routers:
    dokploy-router-app:
      rule: Host(\`dokploy.docker.localhost\`) && PathPrefix(\`/\`)
      service: dokploy-service-app
      entryPoints:
        - web
      middlewares: redirect-to-https
`;
	fs.writeFileSync(".docker/traefik/dynamic/dokploy.yml", malformedMiddlewares);

	expect(() => createDefaultServerTraefikConfig()).not.toThrow();
	expect(fs.readFileSync(".docker/traefik/dynamic/dokploy.yml", "utf8")).toBe(
		malformedMiddlewares,
	);
});

test("Should skip a default traefik configuration path that is a directory", () => {
	vol.reset();
	fs.mkdirSync(".docker/traefik/dynamic/dokploy.yml", { recursive: true });

	expect(() => createDefaultServerTraefikConfig()).not.toThrow();
	expect(fs.statSync(".docker/traefik/dynamic/dokploy.yml").isDirectory()).toBe(
		true,
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
