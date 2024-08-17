import type { Domain } from "@/server/api/services/domain";
import { createDomainLabels } from "@/server/utils/docker/domain";
import { describe, expect, it } from "vitest";

describe("createDomainLabels", () => {
	const appName = "test-app";
	const baseDomain: Domain = {
		host: "example.com",
		port: 8080,
		https: false,
		uniqueConfigKey: 1,
		certificateType: "none",
		applicationId: "",
		composeId: "",
		domainType: "compose",
		serviceName: "test-app",
		domainId: "",
		path: "/",
		createdAt: "",
	};

	it("should create basic labels for web entrypoint", async () => {
		const labels = await createDomainLabels(appName, baseDomain, "web");

		expect(labels).toContain(
			"traefik.http.routers.test-app-1-web.rule=Host(`example.com`)",
		);
		expect(labels).toContain(
			"traefik.http.routers.test-app-1-web.entrypoints=web",
		);
		expect(labels).toContain(
			"traefik.http.services.test-app-1-web.loadbalancer.server.port=8080",
		);
	});

	it("should create labels for websecure entrypoint", async () => {
		const labels = await createDomainLabels(
			appName,
			{ ...baseDomain, https: true },
			"websecure",
		);
		expect(labels).toContain(
			"traefik.http.routers.test-app-1-websecure.rule=Host(`example.com`)",
		);
		expect(labels).toContain(
			"traefik.http.routers.test-app-1-websecure.entrypoints=websecure",
		);
		expect(labels).not.toContain(
			"traefik.http.services.test-app-1-websecure.loadbalancer.server.port=8080",
		);
	});

	it("should add redirect middleware for https on web entrypoint", async () => {
		const labels = await createDomainLabels(
			appName,
			{ ...baseDomain, https: true },
			"web",
		);
		expect(labels).toContain(
			"traefik.http.routers.test-app-1-web.middlewares=redirect-to-https@file",
		);
	});

	it("should add Let's Encrypt configuration for websecure with letsencrypt certificate", async () => {
		const labels = await createDomainLabels(
			appName,
			{ ...baseDomain, https: true, certificateType: "letsencrypt" },
			"websecure",
		);
		expect(labels).toContain(
			"traefik.http.routers.test-app-1-websecure.tls.certresolver=letsencrypt",
		);
	});
});
