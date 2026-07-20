import { readFileSync } from "node:fs";
import path from "node:path";
import {
	compileCaddyConfig,
	translateTraefikDynamicConfigToCaddyFragment,
} from "@dokploy/server";
import { describe, expect, test } from "vitest";

const fixture = (name: string) =>
	readFileSync(path.join(__dirname, "fixtures", name), "utf8");

const getServers = (config: ReturnType<typeof compileCaddyConfig>) => {
	const apps = config.apps as Record<string, any>;
	return apps.http.servers as Record<string, any>;
};

describe("Traefik dynamic file to Caddy migration", () => {
	test("translates priority dynamic-file routers, headers, redirects, and external upstreams", () => {
		const result = translateTraefikDynamicConfigToCaddyFragment(
			fixture("priority-dynamic.yml"),
			{ sourceFile: "priority-dynamic.yml" },
		);
		const config = compileCaddyConfig({ fragments: [result.fragment] });
		const servers = getServers(config);

		expect(result.warnings).toEqual([]);
		expect(result.fragment).toMatchObject({
			id: "migration.traefik-dynamic.priority-dynamic",
			source: "traefik-dynamic-file",
		});

		const activityRoutes = result.routes.filter((route) =>
			route.id.includes("activity-feed"),
		);
		expect(activityRoutes).toHaveLength(3);
		expect(activityRoutes.map((route) => route.priority)).toEqual([
			10000, 10000, 10000,
		]);
		expect(activityRoutes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					pathPrefix: "/activity",
					upstreams: ["https://activity.example.net:443"],
				}),
				expect.objectContaining({ pathExact: "/.well-known/webfinger" }),
				expect.objectContaining({ pathExact: "/.well-known/nodeinfo" }),
			]),
		);

		const adminRoute = result.routes.find((route) =>
			route.id.includes("admin-console"),
		);
		expect(adminRoute).toMatchObject({
			hosts: ["example.com", "www.example.com"],
			pathPrefix: "/admin",
			priority: 9000,
			transforms: {
				responseHeaders: {
					"Cache-Control":
						"private, no-store, no-cache, must-revalidate, max-age=0",
					Pragma: "no-cache",
					Expires: "0",
				},
			},
		});

		const redirectRoute = result.routes.find((route) =>
			route.id.includes("site-redirect"),
		);
		expect(redirectRoute).toMatchObject({
			redirectScheme: { scheme: "https", permanent: true },
			upstreams: [],
		});

		const activityProxy = servers.https.routes.find((route: any) =>
			route.match[0].path?.includes("/activity*"),
		);
		expect(activityProxy.handle.at(-1)).toMatchObject({
			handler: "reverse_proxy",
			upstreams: [{ dial: "activity.example.net:443" }],
			transport: { protocol: "http", tls: {} },
		});
	});

	test("normalizes Traefik service URLs with default scheme ports", () => {
		const result = translateTraefikDynamicConfigToCaddyFragment(
			[
				"http:",
				"  routers:",
				"    admin:",
				"      rule: Host(`admin.example.com`)",
				"      entryPoints: [websecure]",
				"      service: admin",
				"      tls:",
				"        certResolver: letsencrypt",
				"  services:",
				"    admin:",
				"      loadBalancer:",
				"        servers:",
				"          - url: http://admin",
			].join("\n"),
			{ sourceFile: "admin.yml" },
		);

		expect(result.routes[0]).toMatchObject({
			upstreams: ["http://admin:80"],
		});
		expect(() =>
			compileCaddyConfig({ fragments: [result.fragment] }),
		).not.toThrow();
	});

	test("skips Traefik api@internal dashboard routers as non-migratable internals", () => {
		const result = translateTraefikDynamicConfigToCaddyFragment(
			[
				"http:",
				"  routers:",
				"    traefik-dashboard:",
				"      rule: PathPrefix(`/dashboard`) || PathPrefix(`/api`)",
				"      entryPoints: [traefik]",
				"      service: api@internal",
				"      middlewares: [internal-allowlist]",
			].join("\n"),
			{ sourceFile: "routers.yml" },
		);

		expect(result.routes).toEqual([]);
		expect(result.warnings).toEqual([
			expect.objectContaining({
				code: "unsupported-router",
				routerName: "traefik-dashboard",
				serviceName: "api@internal",
				blocking: false,
				message: expect.stringContaining("Skipped Traefik internal router"),
			}),
		]);
	});

	test("translates active routes that use ipAllowList file middleware", () => {
		const result = translateTraefikDynamicConfigToCaddyFragment(
			[
				"http:",
				"  routers:",
				"    dash:",
				"      rule: Host(`dash.example.com`)",
				"      entryPoints: [websecure]",
				"      service: dash",
				"      tls:",
				"        certResolver: letsencrypt",
				"      middlewares: [internal-allowlist]",
				"  services:",
				"    dash:",
				"      loadBalancer:",
				"        servers:",
				"          - url: http://dash:8000",
				"  middlewares:",
				"    internal-allowlist:",
				"      ipAllowList:",
				"        sourceRange:",
				"          - 192.0.2.0/24",
			].join("\n"),
			{ sourceFile: "dash.yml" },
		);

		expect(result.warnings).toEqual([]);
		expect(result.routes[0]).toMatchObject({
			allowedRemoteIps: ["192.0.2.0/24"],
		});
		const config = compileCaddyConfig({ fragments: [result.fragment] });
		const servers = getServers(config);
		expect(servers.https.routes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					match: [
						expect.objectContaining({
							remote_ip: { ranges: ["192.0.2.0/24"] },
						}),
					],
				}),
				expect.objectContaining({
					handle: [
						expect.objectContaining({
							handler: "static_response",
							status_code: 403,
						}),
					],
				}),
			]),
		);
	});

	test("translates strip/add prefix, basicAuth, chain, and blocks unsupported constructs", () => {
		const result = translateTraefikDynamicConfigToCaddyFragment(
			fixture("middleware-coverage.yml"),
			{ sourceFile: "middleware-coverage.yml" },
		);

		const toolRoute = result.routes.find((route) => route.id.endsWith("-tool"));
		expect(toolRoute).toMatchObject({
			transforms: {
				stripPrefix: "/public",
				addPrefix: "/internal",
				requestHeaders: { "X-Forwarded-Proto": "https" },
				responseHeaders: { "X-Test": "true" },
			},
			basicAuth: [{ username: "admin", hash: "$2y$05$abcdef" }],
		});

		expect(result.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "unsupported-service",
					serviceName: "tool",
					blocking: true,
				}),
				expect.objectContaining({
					code: "unsupported-middleware",
					middlewareName: "plugin-auth",
					blocking: true,
				}),
				expect.objectContaining({
					code: "unsupported-router",
					routerName: "unsupported-plugin",
					message: expect.stringContaining("Custom certResolver"),
					blocking: true,
				}),
			]),
		);
	});

	test("blocks basicAuth hashes that Caddy cannot safely consume", () => {
		const result = translateTraefikDynamicConfigToCaddyFragment(
			[
				"http:",
				"  routers:",
				"    secure:",
				"      rule: Host(`secure.example.com`)",
				"      service: secure",
				"      middlewares: [legacy-auth]",
				"  services:",
				"    secure:",
				"      loadBalancer:",
				"        servers:",
				"          - url: http://secure:3000",
				"  middlewares:",
				"    legacy-auth:",
				"      basicAuth:",
				"        users:",
				"          - admin:$apr1$legacy-hash",
			].join("\n"),
			{ sourceFile: "legacy-auth.yml" },
		);

		expect(result.routes[0]?.basicAuth).toBeNull();
		expect(result.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "unsupported-security-middleware",
					middlewareName: "legacy-auth",
					blocking: true,
					message: expect.stringContaining("hash format"),
				}),
			]),
		);
	});
});
