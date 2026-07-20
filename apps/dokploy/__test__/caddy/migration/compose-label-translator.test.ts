import { readFileSync } from "node:fs";
import path from "node:path";
import {
	compileCaddyConfig,
	translateTraefikComposeLabelsToCaddyFragment,
} from "@dokploy/server";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";

const fixture = (name: string) =>
	parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as any;

const getServers = (config: ReturnType<typeof compileCaddyConfig>) => {
	const apps = config.apps as Record<string, any>;
	return apps.http.servers as Record<string, any>;
};

const composeLabels = (serviceName: string) =>
	fixture("generic-compose-labels.yml").services[serviceName].deploy?.labels ??
	fixture("generic-compose-labels.yml").services[serviceName].labels;

describe("Traefik compose labels to Caddy migration", () => {
	test("translates representative Dokploy-generated HTTP/HTTPS label pairs", () => {
		const result = translateTraefikComposeLabelsToCaddyFragment(
			composeLabels("frontend"),
			{
				sourceFile: "compose-sample-stack/docker-compose.yml",
				appName: "compose-sample-stack",
				serviceName: "frontend",
				upstreamServiceName: "frontend",
			},
		);
		const config = compileCaddyConfig({ fragments: [result.fragment] });
		const servers = getServers(config);

		expect(result.warnings).toEqual([]);
		expect(result.classifications.some((item) => item.dokployGenerated)).toBe(
			true,
		);

		const secureRoute = result.routes.find((route) =>
			route.id.includes("websecure"),
		);
		expect(secureRoute).toMatchObject({
			source: "traefik-compose-label",
			hosts: ["app.example.com"],
			https: true,
			upstreams: ["http://frontend:3000"],
		});

		const redirectRoute = result.routes.find((route) =>
			route.id.endsWith("-web"),
		);
		expect(redirectRoute).toMatchObject({
			redirectScheme: { scheme: "https", permanent: true },
			upstreams: [],
		});
		expect(servers.https.routes[0].handle.at(-1)).toMatchObject({
			handler: "reverse_proxy",
			upstreams: [{ dial: "frontend:3000" }],
		});
	});

	test("translates manual compose labels with OR host rules and file middleware definitions", () => {
		const result = translateTraefikComposeLabelsToCaddyFragment(
			composeLabels("cms"),
			{
				sourceFile: "cms-site/docker-compose.yml",
				serviceName: "cms",
				upstreamServiceName: "cms",
				fileMiddlewares: {
					"cms-security-headers": {
						headers: {
							stsSeconds: 31536000,
							stsIncludeSubdomains: true,
							stsPreload: true,
							referrerPolicy: "strict-origin-when-cross-origin",
							contentTypeNosniff: true,
							customFrameOptionsValue: "SAMEORIGIN",
						},
					},
				},
			},
		);

		const prodRoute = result.routes.find((route) =>
			route.id.includes("cms-prod"),
		);
		expect(result.warnings).toEqual([]);
		expect(prodRoute).toMatchObject({
			hosts: ["example.com", "www.example.com"],
			https: true,
			upstreams: ["http://cms:8080"],
			transforms: {
				responseHeaders: {
					"Strict-Transport-Security":
						"max-age=31536000; includeSubDomains; preload",
					"Referrer-Policy": "strict-origin-when-cross-origin",
					"X-Content-Type-Options": "nosniff",
					"X-Frame-Options": "SAMEORIGIN",
				},
			},
		});
	});

	test("translates path-specific manual labels with priority and dynamic file middleware mapping", () => {
		const result = translateTraefikComposeLabelsToCaddyFragment(
			composeLabels("admin"),
			{
				sourceFile: "admin-console/docker-compose.yml",
				serviceName: "admin",
				upstreamServiceName: "admin",
				fileMiddlewares: {
					"admin-no-store": {
						headers: {
							customResponseHeaders: {
								"Cache-Control": "private, no-store",
							},
						},
					},
				},
			},
		);

		expect(result.warnings).toEqual([]);
		const adminRoutes = result.routes.filter((route) =>
			route.id.includes("admin-console"),
		);
		expect(adminRoutes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					priority: 100,
					pathPrefix: "/admin",
					transforms: expect.objectContaining({
						responseHeaders: expect.objectContaining({
							"Cache-Control": "private, no-store",
						}),
					}),
				}),
				expect.objectContaining({
					priority: 100,
					pathExact: "/login",
				}),
			]),
		);
	});

	test("treats tls=true router labels as HTTPS intent", () => {
		const result = translateTraefikComposeLabelsToCaddyFragment(
			[
				"traefik.http.routers.app.rule=Host(`tls.example.com`)",
				"traefik.http.routers.app.entrypoints=websecure",
				"traefik.http.routers.app.tls=true",
				"traefik.http.routers.app.service=app",
				"traefik.http.services.app.loadbalancer.server.port=3000",
			],
			{
				sourceFile: "tls/docker-compose.yml",
				serviceName: "app",
				upstreamServiceName: "app",
			},
		);

		expect(result.warnings).toEqual([]);
		expect(result.routes[0]).toMatchObject({
			hosts: ["tls.example.com"],
			https: true,
			upstreams: ["http://app:3000"],
		});
	});

	test("translates compose-label routes that reference ipAllowList file middleware", () => {
		const result = translateTraefikComposeLabelsToCaddyFragment(
			[
				"traefik.http.routers.dash.rule=Host(`dash.example.com`)",
				"traefik.http.routers.dash.entrypoints=websecure",
				"traefik.http.routers.dash.tls.certresolver=letsencrypt",
				"traefik.http.routers.dash.service=dash",
				"traefik.http.routers.dash.middlewares=internal-allowlist@file",
				"traefik.http.services.dash.loadbalancer.server.port=8000",
			],
			{
				sourceFile: "dash/docker-compose.yml",
				serviceName: "dash",
				upstreamServiceName: "dash",
				fileMiddlewares: {
					"internal-allowlist": {
						ipAllowList: {
							sourceRange: ["192.0.2.0/24"],
						},
					} as any,
				},
			},
		);

		expect(result.warnings).toEqual([]);
		expect(result.routes[0]).toMatchObject({
			allowedRemoteIps: ["192.0.2.0/24"],
		});
	});

	test("drops generated labels when manual labels are present after security middleware is migratable", () => {
		const result = translateTraefikComposeLabelsToCaddyFragment(
			[
				"traefik.enable=true",
				"traefik.http.routers.sample-app-42-websecure.rule=Host(`dashboard.example.com`)",
				"traefik.http.routers.sample-app-42-websecure.entrypoints=websecure",
				"traefik.http.routers.sample-app-42-websecure.tls.certresolver=letsencrypt",
				"traefik.http.routers.sample-app-42-websecure.middlewares=internal-allowlist@file",
				"traefik.http.routers.sample-app-42-websecure.service=sample-app-42-websecure",
				"traefik.http.services.sample-app-42-websecure.loadbalancer.server.port=8000",
				"traefik.http.routers.custom.rule=Host(`custom.example.com`)",
				"traefik.http.routers.custom.entrypoints=websecure",
				"traefik.http.routers.custom.tls.certresolver=letsencrypt",
				"traefik.http.routers.custom.service=custom",
				"traefik.http.services.custom.loadbalancer.server.port=3000",
			],
			{
				sourceFile: "sample-app/dashboard-api/labels",
				appName: "sample-app",
				domains: [
					{
						host: "dashboard.example.com",
						uniqueConfigKey: 42,
						https: true,
					} as any,
				],
				serviceName: "dashboard-api",
				upstreamServiceName: "dashboard-api",
				fileMiddlewares: {
					"internal-allowlist": {
						ipAllowList: {
							sourceRange: ["192.0.2.0/24"],
						},
					} as any,
				},
			},
		);

		expect(result.routes).toEqual([
			expect.objectContaining({
				hosts: ["custom.example.com"],
				upstreams: ["http://dashboard-api:3000"],
			}),
		]);
		expect(result.warnings).toEqual([]);
	});

	test("parses inline ipWhiteList labels as Caddy remote IP restrictions", () => {
		const result = translateTraefikComposeLabelsToCaddyFragment(
			[
				"traefik.http.routers.admin.rule=Host(`admin.example.com`)",
				"traefik.http.routers.admin.entrypoints=websecure",
				"traefik.http.routers.admin.tls.certresolver=letsencrypt",
				"traefik.http.routers.admin.service=admin",
				"traefik.http.routers.admin.middlewares=admin-allow",
				"traefik.http.services.admin.loadbalancer.server.port=8080",
				"traefik.http.middlewares.admin-allow.ipWhiteList.sourceRange=192.0.2.0/24,127.0.0.1/32",
			],
			{
				sourceFile: "admin/docker-compose.yml",
				serviceName: "admin",
				upstreamServiceName: "admin",
			},
		);

		expect(result.warnings).toEqual([]);
		expect(result.routes[0]).toMatchObject({
			allowedRemoteIps: ["192.0.2.0/24", "127.0.0.1/32"],
		});
	});

	test("does not classify app-name-shaped labels as generated when DB domains are provided", () => {
		const result = translateTraefikComposeLabelsToCaddyFragment(
			[
				"traefik.http.routers.my-compose-custom-web.rule=Host(`custom.example.com`)",
				"traefik.http.routers.my-compose-custom-web.entrypoints=web",
				"traefik.http.services.my-compose-custom-web.loadbalancer.server.port=8080",
			],
			{
				sourceFile: "my-compose/docker-compose.yml",
				appName: "my-compose",
				domains: [],
				serviceName: "web",
				upstreamServiceName: "web",
			},
		);

		expect(result.classifications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label:
						"traefik.http.routers.my-compose-custom-web.rule=Host(`custom.example.com`)",
					dokployGenerated: false,
				}),
			]),
		);
		expect(result.routes[0]).toMatchObject({
			hosts: ["custom.example.com"],
			upstreams: ["http://web:8080"],
		});
	});

	test("returns blocking warnings for unsupported label rules and middleware constructs", () => {
		const result = translateTraefikComposeLabelsToCaddyFragment(
			composeLabels("unsupported"),
			{
				sourceFile: "unsupported/docker-compose.yml",
				serviceName: "unsupported",
			},
		);

		expect(result.routes).toHaveLength(0);
		expect(result.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "unsupported-matcher",
					routerName: "unsupported",
					blocking: true,
				}),
				expect.objectContaining({
					code: "unsupported-middleware",
					middlewareName: "plugin-only",
					blocking: true,
				}),
			]),
		);
	});
});
