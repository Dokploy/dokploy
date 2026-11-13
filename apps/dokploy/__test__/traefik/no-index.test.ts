import type { ApplicationNested, Domain } from "@dokploy/server";
import {
	createDomainLabels,
	createRouterConfig,
	NO_INDEX_HEADER_VALUE,
	noIndexMiddlewareName,
} from "@dokploy/server";
import { describe, expect, test } from "vitest";

const app = {
	appName: "my-app",
	redirects: [],
	security: [],
} as unknown as ApplicationNested;

const baseDomain: Domain = {
	applicationId: "app-1",
	certificateType: "none",
	createdAt: "",
	domainId: "domain-1",
	host: "app.example.com",
	https: false,
	path: null,
	port: 3000,
	customEntrypoint: null,
	serviceName: "my-app",
	composeId: "",
	customCertResolver: null,
	domainType: "application",
	uniqueConfigKey: 7,
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
	middlewares: null,
	forwardAuthEnabled: false,
	noIndex: false,
	enabled: true,
};

const headerLabel = `traefik.http.middlewares.noindex-my-app-7.headers.customresponseheaders.X-Robots-Tag=${NO_INDEX_HEADER_VALUE}`;

describe("noIndexMiddlewareName", () => {
	test("is unique per app and uniqueConfigKey", () => {
		expect(noIndexMiddlewareName("my-app", 7)).toBe("noindex-my-app-7");
		expect(noIndexMiddlewareName("my-app", 8)).not.toBe(
			noIndexMiddlewareName("my-app", 7),
		);
	});
});

describe("createRouterConfig noIndex wiring", () => {
	test("does not add the middleware by default", async () => {
		const config = await createRouterConfig(app, baseDomain, "web");
		expect(config.middlewares).not.toContain("noindex-my-app-7");
	});

	test("adds the middleware when noIndex is enabled", async () => {
		const config = await createRouterConfig(
			app,
			{ ...baseDomain, noIndex: true },
			"web",
		);
		expect(config.middlewares).toContain("noindex-my-app-7");
	});

	test("applies to preview deployment domains", async () => {
		const previewApp = {
			appName: "my-app-preview-abc123",
			redirects: [],
			security: [],
		} as unknown as ApplicationNested;
		const config = await createRouterConfig(
			previewApp,
			{ ...baseDomain, domainType: "preview", noIndex: true },
			"websecure",
		);
		expect(config.middlewares).toContain(
			noIndexMiddlewareName("my-app-preview-abc123", 7),
		);
	});

	test("skips the redirect-only web router when https is on", async () => {
		const domain: Domain = {
			...baseDomain,
			https: true,
			certificateType: "letsencrypt",
			noIndex: true,
		};
		const web = await createRouterConfig(app, domain, "web");
		const websecure = await createRouterConfig(app, domain, "websecure");
		expect(web.middlewares).toEqual(["redirect-to-https"]);
		expect(websecure.middlewares).toContain("noindex-my-app-7");
	});
});

describe("createDomainLabels noIndex wiring", () => {
	test("emits no noindex labels by default", () => {
		const labels = createDomainLabels("my-app", baseDomain, "web");
		expect(labels.some((l) => l.includes("noindex"))).toBe(false);
	});

	test("defines the header middleware and attaches it to the router", () => {
		const labels = createDomainLabels(
			"my-app",
			{ ...baseDomain, noIndex: true },
			"web",
		);
		expect(labels).toContain(headerLabel);
		expect(labels).toContain(
			"traefik.http.routers.my-app-7-web.middlewares=noindex-my-app-7",
		);
	});

	test("attaches the middleware only to the websecure router when https is on", () => {
		const domain: Domain = {
			...baseDomain,
			https: true,
			certificateType: "letsencrypt",
			noIndex: true,
		};
		const web = createDomainLabels("my-app", domain, "web");
		const websecure = createDomainLabels("my-app", domain, "websecure");

		expect(web).toContain(headerLabel);
		expect(web).toContain(
			"traefik.http.routers.my-app-7-web.middlewares=redirect-to-https@file",
		);
		expect(websecure).not.toContain(headerLabel);
		expect(websecure).toContain(
			"traefik.http.routers.my-app-7-websecure.middlewares=noindex-my-app-7",
		);
	});
});
