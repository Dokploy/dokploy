import { fs, vol } from "memfs";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

import type { Admin } from "@/server/api/services/admin";
import { createDefaultServerTraefikConfig } from "@/server/setup/traefik-setup";
import { loadOrCreateConfig } from "@/server/utils/traefik/application";
import type { FileConfig } from "@/server/utils/traefik/file-types";
import { updateServerTraefik } from "@/server/utils/traefik/web-server";
import { beforeEach, expect, test, vi } from "vitest";

const baseAdmin: Admin = {
	createdAt: "",
	authId: "",
	adminId: "string",
	serverIp: null,
	certificateType: "none",
	host: null,
	letsEncryptEmail: null,
	sshPrivateKey: null,
	enableDockerCleanup: false,
	enableLogRotation: false,
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
			...baseAdmin,
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
	updateServerTraefik(baseAdmin, "example.com");

	const config: FileConfig = loadOrCreateConfig("dokploy");

	expect(config.http?.routers?.["dokploy-router-app-secure"]).toBeUndefined();
});

test("Should not touch config without host", () => {
	const originalConfig: FileConfig = loadOrCreateConfig("dokploy");

	updateServerTraefik(baseAdmin, null);

	const config: FileConfig = loadOrCreateConfig("dokploy");

	expect(originalConfig).toEqual(config);
});

test("Should remove websecure if https rollback to http", () => {
	const originalConfig: FileConfig = loadOrCreateConfig("dokploy");

	updateServerTraefik(
		{ ...baseAdmin, certificateType: "letsencrypt" },
		"example.com",
	);

	updateServerTraefik({ ...baseAdmin, certificateType: "none" }, "example.com");

	const config: FileConfig = loadOrCreateConfig("dokploy");

	expect(config.http?.routers?.["dokploy-router-app-secure"]).toBeUndefined();
	expect(
		config.http?.routers?.["dokploy-router-app"]?.middlewares,
	).not.toContain("redirect-to-https");
});
