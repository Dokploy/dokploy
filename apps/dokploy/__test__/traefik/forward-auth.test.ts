import {
	buildForwardAuthEnv,
	deriveBaseDomain,
	deriveCookieSecret,
	forwardAuthCallbackUrl,
} from "@dokploy/server/setup/forward-auth-setup";
import type { ApplicationNested } from "@dokploy/server/utils/builders";
import type { Domain } from "@dokploy/server/services/domain";
import { createRouterConfig as createTraefikRouterConfig } from "@dokploy/server/utils/traefik/domain";
import { forwardAuthMiddlewareName } from "@dokploy/server/utils/traefik/forward-auth";
import { beforeAll, describe, expect, test } from "vitest";

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
	serviceName: "",
	composeId: "",
	customCertResolver: null,
	domainType: "application",
	uniqueConfigKey: 7,
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
	middlewares: null,
	forwardAuthEnabled: false,
	externalUpstreamId: null,
};

describe("forwardAuthMiddlewareName", () => {
	test("is stable and unique per app + uniqueConfigKey", () => {
		expect(forwardAuthMiddlewareName("my-app", 7)).toBe(
			"forward-auth-my-app-7",
		);
		expect(forwardAuthMiddlewareName("my-app", 7)).toBe(
			forwardAuthMiddlewareName("my-app", 7),
		);
		expect(forwardAuthMiddlewareName("my-app", 7)).not.toBe(
			forwardAuthMiddlewareName("my-app", 8),
		);
	});
});

describe("createRouterConfig forward-auth wiring", () => {
	test("does NOT add forward-auth middleware when no provider is linked", async () => {
		const config = await createTraefikRouterConfig(app, baseDomain, "websecure");
		expect(config.middlewares).not.toContain(
			forwardAuthMiddlewareName("my-app", 7),
		);
	});

	test("adds forward-auth middleware when a provider is linked", async () => {
		const domain: Domain = {
			...baseDomain,
			forwardAuthEnabled: true,
		};
		const config = await createTraefikRouterConfig(app, domain, "websecure");
		expect(config.middlewares).toContain(
			forwardAuthMiddlewareName("my-app", 7),
		);
	});

	test("forward-auth runs before custom domain middlewares", async () => {
		const domain: Domain = {
			...baseDomain,
			forwardAuthEnabled: true,
			middlewares: ["rate-limit@file"],
		};
		const config = await createTraefikRouterConfig(app, domain, "websecure");
		const forwardAuthIdx = config.middlewares?.indexOf(
			forwardAuthMiddlewareName("my-app", 7),
		);
		const customIdx = config.middlewares?.indexOf("rate-limit@file");
		expect(forwardAuthIdx).toBeGreaterThanOrEqual(0);
		expect(customIdx).toBeGreaterThan(forwardAuthIdx as number);
	});

	test("redirect-only web router does not get the forward-auth middleware", async () => {
		const domain: Domain = {
			...baseDomain,
			https: true,
			forwardAuthEnabled: true,
		};
		const config = await createTraefikRouterConfig(app, domain, "web");
		expect(config.middlewares).toContain("redirect-to-https");
		expect(config.middlewares).not.toContain(
			forwardAuthMiddlewareName("my-app", 7),
		);
	});
});

describe("buildForwardAuthEnv", () => {
	const baseOptions = {
		oidc: {
			clientId: "client-123",
			clientSecret: "secret-xyz",
			issuer: "https://idp.example.com",
		},
		cookieSecret: "cookie-secret-value",
		authDomain: "auth.acme.com",
		baseDomain: ".acme.com",
		authDomainHttps: true,
	};

	test("emits the required oauth2-proxy OIDC env vars", () => {
		const env = buildForwardAuthEnv(baseOptions);
		expect(env).toContain("OAUTH2_PROXY_PROVIDER=oidc");
		expect(env).toContain(
			"OAUTH2_PROXY_OIDC_ISSUER_URL=https://idp.example.com",
		);
		expect(env).toContain("OAUTH2_PROXY_CLIENT_ID=client-123");
		expect(env).toContain("OAUTH2_PROXY_CLIENT_SECRET=secret-xyz");
		expect(env).toContain("OAUTH2_PROXY_COOKIE_SECRET=cookie-secret-value");
		expect(env).toContain("OAUTH2_PROXY_REVERSE_PROXY=true");
		expect(env).toContain("OAUTH2_PROXY_HTTP_ADDRESS=0.0.0.0:4180");
	});

	test("uses the central auth domain for the single fixed callback", () => {
		const env = buildForwardAuthEnv(baseOptions);
		expect(env).toContain(
			"OAUTH2_PROXY_REDIRECT_URL=https://auth.acme.com/oauth2/callback",
		);
	});

	test("shares cookie + whitelist on the base domain (no per-app redeploy)", () => {
		const env = buildForwardAuthEnv(baseOptions);
		expect(env).toContain("OAUTH2_PROXY_COOKIE_DOMAINS=.acme.com");
		expect(env).toContain("OAUTH2_PROXY_WHITELIST_DOMAINS=.acme.com");
	});

	test("matches cookie Secure flag and callback scheme to https setting", () => {
		const https = buildForwardAuthEnv(baseOptions);
		expect(https).toContain("OAUTH2_PROXY_COOKIE_SECURE=true");

		const http = buildForwardAuthEnv({
			...baseOptions,
			authDomainHttps: false,
		});
		expect(http).toContain("OAUTH2_PROXY_COOKIE_SECURE=false");
		expect(http).toContain(
			"OAUTH2_PROXY_REDIRECT_URL=http://auth.acme.com/oauth2/callback",
		);
	});

	test("allows unverified emails so OIDC providers don't 500 the callback", () => {
		const env = buildForwardAuthEnv(baseOptions);
		expect(env).toContain(
			"OAUTH2_PROXY_INSECURE_OIDC_ALLOW_UNVERIFIED_EMAIL=true",
		);
	});

	test("defaults to any authenticated user and standard scopes", () => {
		const env = buildForwardAuthEnv(baseOptions);
		expect(env).toContain("OAUTH2_PROXY_EMAIL_DOMAINS=*");
		expect(env).toContain("OAUTH2_PROXY_SCOPE=openid email profile");
	});

	test("honors custom scopes and email domains", () => {
		const env = buildForwardAuthEnv({
			...baseOptions,
			oidc: { ...baseOptions.oidc, scopes: ["openid", "groups"] },
			emailDomains: ["acme.com", "corp.com"],
		});
		expect(env).toContain("OAUTH2_PROXY_SCOPE=openid groups");
		expect(env).toContain("OAUTH2_PROXY_EMAIL_DOMAINS=acme.com,corp.com");
	});

	test("sets skip-discovery flag only when requested", () => {
		const withoutSkip = buildForwardAuthEnv(baseOptions);
		expect(withoutSkip).not.toContain("OAUTH2_PROXY_SKIP_OIDC_DISCOVERY=true");

		const withSkip = buildForwardAuthEnv({
			...baseOptions,
			oidc: { ...baseOptions.oidc, skipDiscovery: true },
		});
		expect(withSkip).toContain("OAUTH2_PROXY_SKIP_OIDC_DISCOVERY=true");
	});
});

describe("deriveBaseDomain", () => {
	test("strips the auth subdomain to the shared base", () => {
		expect(deriveBaseDomain("auth.acme.com")).toBe(".acme.com");
		expect(deriveBaseDomain("sso.apps.acme.com")).toBe(".apps.acme.com");
	});

	test("keeps a two-label apex as the base", () => {
		expect(deriveBaseDomain("acme.com")).toBe(".acme.com");
	});
});

describe("forwardAuthCallbackUrl", () => {
	test("builds the single IdP callback per scheme", () => {
		expect(forwardAuthCallbackUrl("auth.acme.com", true)).toBe(
			"https://auth.acme.com/oauth2/callback",
		);
		expect(forwardAuthCallbackUrl("auth.acme.com", false)).toBe(
			"http://auth.acme.com/oauth2/callback",
		);
	});
});

describe("deriveCookieSecret", () => {
	beforeAll(() => {
		process.env.BETTER_AUTH_SECRET = "test-root-secret";
	});

	test("is deterministic for the same salt (survives service updates)", () => {
		expect(deriveCookieSecret(".acme.com")).toBe(
			deriveCookieSecret(".acme.com"),
		);
	});

	test("differs per salt", () => {
		expect(deriveCookieSecret(".acme.com")).not.toBe(
			deriveCookieSecret(".other.com"),
		);
	});

	test("produces a 16-byte hex secret (oauth2-proxy requirement)", () => {
		const secret = deriveCookieSecret(".acme.com");
		expect(Buffer.from(secret, "hex")).toHaveLength(16);
	});
});
