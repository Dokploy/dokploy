import {
	compileCaddyConfig,
	createCaddyDashboardRouteFragment,
} from "@dokploy/server";
import type { webServerSettings } from "@dokploy/server/db/schema";
import { expect, test } from "vitest";

type WebServerSettings = typeof webServerSettings.$inferSelect;

const settings = (overrides: Partial<WebServerSettings> = {}) =>
	({
		id: "settings-1",
		webServerProvider: "caddy",
		caddyTrustedProxyConfig: null,
		https: false,
		certificateType: "none",
		host: null,
		serverIp: null,
		letsEncryptEmail: null,
		sshPrivateKey: null,
		enableDockerCleanup: false,
		logCleanupCron: null,
		metricsConfig: {} as WebServerSettings["metricsConfig"],
		whitelabelingConfig: null,
		cleanupCacheApplications: false,
		cleanupCacheOnCompose: false,
		cleanupCacheOnPreviews: false,
		createdAt: null,
		updatedAt: new Date(),
		...overrides,
	}) as WebServerSettings;

const getServers = (config: ReturnType<typeof compileCaddyConfig>) => {
	const apps = config.apps as Record<string, any>;
	return apps.http.servers as Record<string, any>;
};

test("keeps the Caddy admin API bound to localhost", () => {
	const config = compileCaddyConfig();

	expect(config.admin.listen).toBe("localhost:2019");
});

test("creates a Caddy dashboard route to the Dokploy container", () => {
	const fragment = createCaddyDashboardRouteFragment(
		settings(),
		"dashboard.example.com",
	);
	const config = compileCaddyConfig({ fragments: [fragment] });
	const route = getServers(config).http.routes[0];

	expect(fragment).toMatchObject({
		id: "dashboard.dokploy",
		source: "dokploy-dashboard",
	});
	expect(route.match[0]).toMatchObject({
		host: ["dashboard.example.com"],
	});
	expect(route.match[0].path).toBeUndefined();
	expect(route.handle.at(-1)).toMatchObject({
		handler: "reverse_proxy",
		upstreams: [{ dial: "dokploy:3000" }],
	});
});

test("dashboard HTTPS route uses global ACME email when compiled", () => {
	const fragment = createCaddyDashboardRouteFragment(
		settings({ https: true, letsEncryptEmail: "ops@example.com" }),
		"панель.example.com",
	);
	const config = compileCaddyConfig({
		fragments: [fragment],
		letsEncryptEmail: "ops@example.com",
	});
	const servers = getServers(config);

	expect(fragment.routes[0]?.hosts).toEqual(["xn--80aksgi6f.example.com"]);
	expect(servers.http.routes[0].handle[0]).toMatchObject({
		handler: "static_response",
		status_code: 308,
	});
	expect(servers.https.routes[0].handle.at(-1)).toMatchObject({
		handler: "reverse_proxy",
	});
	expect((config.apps as any).tls.automation.policies[0].issuers[0].email).toBe(
		"ops@example.com",
	);
});
