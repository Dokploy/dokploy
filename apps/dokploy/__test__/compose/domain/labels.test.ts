import type { Domain } from "@dokploy/server";
import { createDomainLabels } from "@dokploy/server";
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
		previewDeploymentId: "",
	};

	it("should create basic labels for web entrypoint", async () => {
		const labels = await createDomainLabels(appName, baseDomain, "web");
		expect(labels).toEqual([
			"traefik.http.routers.test-app-1-web.rule=Host(`example.com`)",
			"traefik.http.routers.test-app-1-web.entrypoints=web",
			"traefik.http.services.test-app-1-web.loadbalancer.server.port=8080",
			"traefik.http.routers.test-app-1-web.service=test-app-1-web",
		]);
	});

	it("should create labels for websecure entrypoint", async () => {
		const labels = await createDomainLabels(appName, baseDomain, "websecure");
		expect(labels).toEqual([
			"traefik.http.routers.test-app-1-websecure.rule=Host(`example.com`)",
			"traefik.http.routers.test-app-1-websecure.entrypoints=websecure",
			"traefik.http.services.test-app-1-websecure.loadbalancer.server.port=8080",
			"traefik.http.routers.test-app-1-websecure.service=test-app-1-websecure",
		]);
	});

	it("should add the path prefix if is different than / empty", async () => {
		const labels = await createDomainLabels(
			appName,
			{
				...baseDomain,
				path: "/hello",
			},
			"websecure",
		);

		expect(labels).toEqual([
			"traefik.http.routers.test-app-1-websecure.rule=Host(`example.com`) && PathPrefix(`/hello`)",
			"traefik.http.routers.test-app-1-websecure.entrypoints=websecure",
			"traefik.http.services.test-app-1-websecure.loadbalancer.server.port=8080",
			"traefik.http.routers.test-app-1-websecure.service=test-app-1-websecure",
		]);
	});

	it("should add redirect middleware for https on web entrypoint", async () => {
		const httpsBaseDomain = { ...baseDomain, https: true };
		const labels = await createDomainLabels(appName, httpsBaseDomain, "web");
		expect(labels).toContain(
			"traefik.http.routers.test-app-1-web.middlewares=redirect-to-https@file",
		);
	});

	it("should add Let's Encrypt configuration for websecure with letsencrypt certificate", async () => {
		const letsencryptDomain = {
			...baseDomain,
			https: true,
			certificateType: "letsencrypt" as const,
		};
		const labels = await createDomainLabels(
			appName,
			letsencryptDomain,
			"websecure",
		);
		expect(labels).toContain(
			"traefik.http.routers.test-app-1-websecure.tls.certresolver=letsencrypt",
		);
	});

	it("should not add Let's Encrypt configuration for non-letsencrypt certificate", async () => {
		const nonLetsencryptDomain = {
			...baseDomain,
			https: true,
			certificateType: "none" as const,
		};
		const labels = await createDomainLabels(
			appName,
			nonLetsencryptDomain,
			"websecure",
		);
		expect(labels).not.toContain(
			"traefik.http.routers.test-app-1-websecure.tls.certresolver=letsencrypt",
		);
	});

	it("should handle different ports correctly", async () => {
		const customPortDomain = { ...baseDomain, port: 3000 };
		const labels = await createDomainLabels(appName, customPortDomain, "web");
		expect(labels).toContain(
			"traefik.http.services.test-app-1-web.loadbalancer.server.port=3000",
		);
	});
});
