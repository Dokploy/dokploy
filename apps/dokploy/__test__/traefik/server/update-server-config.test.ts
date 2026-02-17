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
	cleanupCacheApplications: false,
	cleanupCacheOnCompose: false,
	cleanupCacheOnPreviews: false,
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
