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
		customCertResolver: null,
		certificateType: "none",
		applicationId: "",
		composeId: "",
		domainType: "compose",
		serviceName: "test-app",
		domainId: "",
		path: "/",
		createdAt: "",
		previewDeploymentId: "",
		internalPath: "/",
		stripPath: false,
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

	it("should add stripPath middleware when stripPath is enabled", async () => {
		const stripPathDomain = {
			...baseDomain,
			path: "/api",
			stripPath: true,
		};
		const labels = await createDomainLabels(appName, stripPathDomain, "web");

		expect(labels).toContain(
			"traefik.http.middlewares.stripprefix-test-app-1.stripprefix.prefixes=/api",
		);
		expect(labels).toContain(
			"traefik.http.routers.test-app-1-web.middlewares=stripprefix-test-app-1",
		);
	});

	it("should add internalPath middleware when internalPath is set", async () => {
		const internalPathDomain = {
			...baseDomain,
			internalPath: "/hello",
		};
		const webLabels = await createDomainLabels(
			appName,
			internalPathDomain,
			"web",
		);
		const websecureLabels = await createDomainLabels(
			appName,
			internalPathDomain,
			"websecure",
		);

		// Middleware definition should only appear in web entrypoint
		expect(webLabels).toContain(
			"traefik.http.middlewares.addprefix-test-app-1.addprefix.prefix=/hello",
		);
		expect(websecureLabels).not.toContain(
			"traefik.http.middlewares.addprefix-test-app-1.addprefix.prefix=/hello",
		);

		// Both routers should reference the middleware
		expect(webLabels).toContain(
			"traefik.http.routers.test-app-1-web.middlewares=addprefix-test-app-1",
		);
		expect(websecureLabels).toContain(
			"traefik.http.routers.test-app-1-websecure.middlewares=addprefix-test-app-1",
		);
	});

	it("should combine HTTPS redirect with internalPath middleware in correct order", async () => {
		const combinedDomain = {
			...baseDomain,
			https: true,
			internalPath: "/hello",
		};
		const webLabels = await createDomainLabels(appName, combinedDomain, "web");
		const websecureLabels = await createDomainLabels(
			appName,
			combinedDomain,
			"websecure",
		);

		// Web entrypoint should have both middlewares with redirect first
		expect(webLabels).toContain(
			"traefik.http.routers.test-app-1-web.middlewares=redirect-to-https@file,addprefix-test-app-1",
		);

		// Websecure should only have the addprefix middleware
		expect(websecureLabels).toContain(
			"traefik.http.routers.test-app-1-websecure.middlewares=addprefix-test-app-1",
		);

		// Middleware definition should only appear once (in web)
		expect(webLabels).toContain(
			"traefik.http.middlewares.addprefix-test-app-1.addprefix.prefix=/hello",
		);
		expect(websecureLabels).not.toContain(
			"traefik.http.middlewares.addprefix-test-app-1.addprefix.prefix=/hello",
		);
	});

	it("should combine all middlewares in correct order", async () => {
		const fullDomain = {
			...baseDomain,
			https: true,
			path: "/api",
			stripPath: true,
			internalPath: "/hello",
		};
		const webLabels = await createDomainLabels(appName, fullDomain, "web");

		// Should have all middleware definitions (only in web)
		expect(webLabels).toContain(
			"traefik.http.middlewares.stripprefix-test-app-1.stripprefix.prefixes=/api",
		);
		expect(webLabels).toContain(
			"traefik.http.middlewares.addprefix-test-app-1.addprefix.prefix=/hello",
		);

		// Should have middlewares in correct order: redirect, stripprefix, addprefix
		expect(webLabels).toContain(
			"traefik.http.routers.test-app-1-web.middlewares=redirect-to-https@file,stripprefix-test-app-1,addprefix-test-app-1",
		);
	});

	it("should not add middleware definitions for websecure entrypoint", async () => {
		const internalPathDomain = {
			...baseDomain,
			path: "/api",
			stripPath: true,
			internalPath: "/hello",
		};
		const websecureLabels = await createDomainLabels(
			appName,
			internalPathDomain,
			"websecure",
		);

		// Should not contain any middleware definitions
		expect(websecureLabels).not.toContain(
			"traefik.http.middlewares.stripprefix-test-app-1.stripprefix.prefixes=/api",
		);
		expect(websecureLabels).not.toContain(
			"traefik.http.middlewares.addprefix-test-app-1.addprefix.prefix=/hello",
		);

		// But should reference the middlewares
		expect(websecureLabels).toContain(
			"traefik.http.routers.test-app-1-websecure.middlewares=stripprefix-test-app-1,addprefix-test-app-1",
		);
	});
});
