import { fs, vol } from "memfs";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

import {
	createDefaultServerTraefikConfig,
} from "@dokploy/server/setup/traefik-setup";
import type { webServerSettings } from "@dokploy/server/db/schema";
import type { FileConfig } from "@dokploy/server/utils/traefik/file-types";
import { loadOrCreateConfig as loadTraefikConfig } from "@dokploy/server/utils/traefik/application";
import { updateServerTraefik as updateWebServerTraefik } from "@dokploy/server/utils/traefik/web-server";
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
	externalUpstreamsEnabled: false,
	externalUpstreamBlockedCidrs: [],
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
	const config: FileConfig = loadTraefikConfig("dokploy");
	expect(config.http?.routers?.["dokploy-router-app"]?.service).toBe(
		"dokploy-service-app",
	);
});

test("Should apply redirect-to-https", () => {
	updateWebServerTraefik(
		{
			...baseSettings,
			https: true,
			certificateType: "letsencrypt",
		},
		"example.com",
	);

	const config: FileConfig = loadTraefikConfig("dokploy");

	expect(config.http?.routers?.["dokploy-router-app"]?.middlewares).toContain(
		"redirect-to-https",
	);
});

test("Should change only host when no certificate", () => {
	updateWebServerTraefik(baseSettings, "example.com");

	const config: FileConfig = loadTraefikConfig("dokploy");

	expect(config.http?.routers?.["dokploy-router-app-secure"]).toBeUndefined();
});

test("Should not touch config without host", () => {
	const originalConfig: FileConfig = loadTraefikConfig("dokploy");

	updateWebServerTraefik(baseSettings, null);

	const config: FileConfig = loadTraefikConfig("dokploy");

	expect(originalConfig).toEqual(config);
});

test("Should remove websecure if https rollback to http", () => {
	updateWebServerTraefik(
		{ ...baseSettings, certificateType: "letsencrypt" },
		"example.com",
	);

	updateWebServerTraefik(
		{ ...baseSettings, certificateType: "none" },
		"example.com",
	);

	const config: FileConfig = loadTraefikConfig("dokploy");

	expect(config.http?.routers?.["dokploy-router-app-secure"]).toBeUndefined();
	expect(
		config.http?.routers?.["dokploy-router-app"]?.middlewares,
	).not.toContain("redirect-to-https");
});
