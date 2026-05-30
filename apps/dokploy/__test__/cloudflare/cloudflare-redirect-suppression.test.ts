import type { Domain } from "@dokploy/server";
import { createDomainLabels } from "@dokploy/server";
import { createRouterConfig } from "@dokploy/server/utils/traefik/domain";
import { describe, expect, it } from "vitest";

/**
 * Cloudflare-published domains terminate TLS at the edge and reach Traefik over
 * plain HTTP via cloudflared. The web->websecure redirect MUST be suppressed in
 * both the application (file-config) and compose (Docker label) paths, otherwise
 * the connector hits a redirect loop / 502.
 */
const baseDomain: Domain = {
	host: "app.example.com",
	port: 8080,
	https: true,
	customEntrypoint: null,
	uniqueConfigKey: 1,
	customCertResolver: null,
	certificateType: "letsencrypt",
	applicationId: "app-1",
	composeId: "",
	domainType: "application",
	serviceName: "web",
	domainId: "dom-1",
	path: "/",
	createdAt: "",
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
	middlewares: null,
	publishToCloudflare: false,
	cloudflareTunnelMode: null,
	cloudflareId: null,
	cloudflareZoneId: null,
	cloudflareTunnelId: null,
	cloudflareDnsRecordId: null,
	cloudflareIngressApplied: false,
	enableCloudflareAccess: false,
	cloudflareAccessApplicationId: null,
};

const fakeApp = {
	appName: "test-app",
	redirects: [],
	security: [],
} as never;

describe("compose Docker labels (docker/domain.ts)", () => {
	it("includes redirect-to-https when NOT Cloudflare-published", () => {
		const labels = createDomainLabels("test-app", baseDomain, "web");
		expect(labels.join("\n")).toContain("redirect-to-https@file");
	});

	it("suppresses redirect-to-https for Cloudflare-published domains", () => {
		const labels = createDomainLabels(
			"test-app",
			{ ...baseDomain, publishToCloudflare: true },
			"web",
		);
		expect(labels.join("\n")).not.toContain("redirect-to-https");
	});
});

describe("application file config (traefik/domain.ts)", () => {
	it("adds the redirect middleware when NOT Cloudflare-published", async () => {
		const config = await createRouterConfig(fakeApp, baseDomain, "web");
		expect(config.middlewares).toContain("redirect-to-https");
	});

	it("suppresses the redirect middleware for Cloudflare-published domains", async () => {
		const config = await createRouterConfig(
			fakeApp,
			{ ...baseDomain, publishToCloudflare: true },
			"web",
		);
		expect(config.middlewares ?? []).not.toContain("redirect-to-https");
	});
});
