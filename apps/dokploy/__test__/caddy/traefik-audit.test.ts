import { fs, vol } from "memfs";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import type { webServerSettings } from "@dokploy/server/db/schema";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import {
	createDefaultServerTraefikConfig,
	getDefaultMiddlewares,
	getDefaultServerTraefikConfig,
	getDefaultTraefikConfig,
} from "@dokploy/server/setup/traefik-setup";
import { findHandWrittenTraefikConfig } from "@dokploy/server/utils/caddy/traefik-audit";
import { createDomainLabels } from "@dokploy/server/utils/docker/domain";
import {
	execAsyncRemote,
	writeFileRemote,
} from "@dokploy/server/utils/process/execAsync";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { createRedirectMiddleware } from "@dokploy/server/utils/traefik/redirect";
import { createSecurityMiddleware } from "@dokploy/server/utils/traefik/security";
import { updateServerTraefik } from "@dokploy/server/utils/traefik/web-server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

vi.mock("@dokploy/server/utils/process/execAsync", async (original) => ({
	...(await original<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncRemote: vi.fn(),
	writeFileRemote: vi.fn(),
}));
vi.mock("@dokploy/server/services/web-server-settings", async (original) => ({
	...(await original<
		typeof import("@dokploy/server/services/web-server-settings")
	>()),
	getWebServerSettings: vi.fn(),
}));

describe("on a remote server", () => {
	const SERVER = "remote";
	const root = `${paths(true).MAIN_TRAEFIK_PATH}/`;
	const application = {
		appName: "app",
		serverId: SERVER,
		security: [] as { username: string; password: string }[],
		redirects: [] as {
			uniqueConfigKey: number;
			regex: string;
			replacement: string;
			permanent: boolean;
		}[],
		previewDeployments: [],
	};
	const domain = (key: number, overrides: object = {}) => ({
		host: `host${key}.test`,
		uniqueConfigKey: key,
		applicationId: "app-id",
		application,
		compose: null as { appName: string; serverId: string } | null,
		previewDeployment: null,
		enabled: true,
		https: false,
		path: "/",
		internalPath: "/",
		stripPath: false,
		port: 80,
		customEntrypoint: null,
		middlewares: [] as string[],
		forwardAuthEnabled: false,
		certificateType: "none",
		...overrides,
	});

	let rows: ReturnType<typeof domain>[];
	// Traefik's files by their name inside its folder, and every running
	// container with its labels.
	let files: Record<string, string>;
	let containers: Record<string, Record<string, string>>;

	const found = () =>
		findHandWrittenTraefikConfig(
			SERVER,
			rows as never,
			new Map(Object.entries(files)),
			new Map(Object.entries(containers)),
		);

	// The server as Dokploy's own Traefik writers leave it: two domains of one
	// application with basic auth and a redirect, and a deployed compose.
	beforeEach(async () => {
		vi.clearAllMocks();
		files = {
			"traefik.yml": getDefaultServerTraefikConfig(),
			"dynamic/middlewares.yml": getDefaultMiddlewares(),
		};
		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			application,
		] as never);
		vi.mocked(writeFileRemote).mockImplementation(async (_, file, content) => {
			files[file.slice(root.length)] = content;
		});
		vi.mocked(execAsyncRemote).mockImplementation(async (_, command) => ({
			stdout: files[command.slice(`cat ${root}`.length)] ?? "",
			stderr: "",
		}));
		application.security = [{ username: "ops", password: "secret" }];
		application.redirects = [
			{
				uniqueConfigKey: 3,
				regex: "^http://old.test/(.*)",
				replacement: "http://new.test/$1",
				permanent: true,
			},
		];
		rows = [
			domain(1, {
				https: true,
				certificateType: "letsencrypt",
				path: "/api",
				stripPath: true,
				internalPath: "/v1",
			}),
			domain(2),
			domain(4, {
				application: null,
				applicationId: null,
				compose: { appName: "shop", serverId: SERVER },
			}),
		];
		const [first, second, shop] = rows;
		// In the order an admin would: a domain, protection, another domain.
		await manageDomain(application as never, first as never);
		await createSecurityMiddleware(
			application as never,
			application.security[0] as never,
		);
		await createRedirectMiddleware(
			application as never,
			application.redirects[0] as never,
		);
		await manageDomain(application as never, second as never);
		containers = {
			"shop-web-1": Object.fromEntries(
				[
					"traefik.enable=true",
					"traefik.docker.network=dokploy-network",
					...createDomainLabels("shop", shop as never, "web"),
				].map((label) => {
					const at = label.indexOf("=");
					return [label.slice(0, at), label.slice(at + 1)];
				}),
			),
			// Not enabled, so Traefik does not read it.
			idle: { "traefik.http.routers.idle.rule": "Host(`idle.test`)" },
		};
	});

	const edit = (
		name: string,
		change: (config: {
			http: {
				routers: Record<
					string,
					{ rule: string; service: string; middlewares: string[] }
				>;
				services: Record<string, unknown>;
				middlewares: Record<string, unknown>;
			};
		}) => void,
	) => {
		const config = parse(files[name] ?? "");
		change(config);
		files[name] = stringify(config);
	};

	it("finds nothing where only Dokploy has written", async () => {
		expect(await found()).toEqual([]);
	});

	it.each<[string, () => void, string]>([
		[
			"another kind of middleware under a name Dokploy uses",
			() =>
				edit("dynamic/middlewares.yml", ({ http }) => {
					http.middlewares["auth-app"] = {
						ipAllowList: { sourceRange: ["10.0.0.0/8"] },
					};
				}),
			"dynamic/middlewares.yml: the middleware auth-app is not the one Dokploy writes. Caddy follows the database, not this file.",
		],
		[
			"a basic auth user that is not in the database",
			() =>
				edit("dynamic/middlewares.yml", ({ http }) => {
					(
						http.middlewares["auth-app"] as { basicAuth: { users: string[] } }
					).basicAuth.users.push("guest:$2b$10$abcdefghijklmnopqrstuv");
				}),
			"dynamic/middlewares.yml: the middleware auth-app is not the one Dokploy writes. Caddy follows the database, not this file.",
		],
		[
			"a password that is not the one in the database",
			() => {
				application.security = [{ username: "ops", password: "changed" }];
			},
			"dynamic/middlewares.yml: the middleware auth-app is not the one Dokploy writes. Caddy follows the database, not this file.",
		],
		[
			"a redirect that is not the one in the database",
			() =>
				edit("dynamic/middlewares.yml", ({ http }) => {
					http.middlewares["redirect-app-3"] = {
						redirectRegex: { regex: "^http://old.test/", replacement: "/" },
					};
				}),
			"dynamic/middlewares.yml: the middleware redirect-app-3 is not the one Dokploy writes. Caddy follows the database, not this file.",
		],
		[
			"a rule that restricts a router by client address",
			() =>
				edit("dynamic/app.yml", ({ http }) => {
					const router = http.routers["app-router-2"];
					if (router) router.rule += " && ClientIP(`10.0.0.0/8`)";
				}),
			"dynamic/app.yml: the router app-router-2 is not the one Dokploy writes for a domain. Caddy follows the database, not this file.",
		],
		[
			"a router Dokploy has no domain for",
			() =>
				edit("dynamic/app.yml", ({ http }) => {
					http.routers.mine = {
						rule: "Host(`mine.test`)",
						service: "app-service-2",
						middlewares: [],
					};
				}),
			"dynamic/app.yml: the router mine is not the one Dokploy writes for a domain. Caddy follows the database, not this file.",
		],
		[
			"a middleware of its own on a router",
			() => {
				edit("dynamic/middlewares.yml", ({ http }) => {
					http.middlewares["office-only"] = {
						ipAllowList: { sourceRange: ["10.0.0.0/8"] },
					};
				});
				edit("dynamic/app.yml", ({ http }) => {
					http.routers["app-router-2"]?.middlewares.push("office-only");
				});
			},
			"dynamic/app.yml: the router app-router-2 uses the middleware office-only, which Caddy will not apply.",
		],
		[
			"a service that points somewhere else",
			() =>
				edit("dynamic/app.yml", ({ http }) => {
					http.services["app-service-2"] = {
						loadBalancer: { servers: [{ url: "http://elsewhere:80" }] },
					};
				}),
			"dynamic/app.yml: the service app-service-2 is not the one Dokploy writes for a domain. Caddy follows the database, not this file.",
		],
		[
			"a middleware attached to a compose router by label",
			() => {
				const labels = containers["shop-web-1"];
				if (labels) {
					labels["traefik.http.routers.shop-4-web.middlewares"] = "office-only";
				}
			},
			"shop-web-1 has Traefik labels that do not come from a domain in Dokploy: traefik.http.routers.shop-4-web.middlewares. Caddy will not apply them.",
		],
		[
			"a compose rule that is not the domain's",
			() => {
				const labels = containers["shop-web-1"];
				if (labels) {
					labels["traefik.http.routers.shop-4-web.rule"] = "Host(`other.test`)";
				}
			},
			"shop-web-1 has Traefik labels that do not come from a domain in Dokploy: traefik.http.routers.shop-4-web.rule. Caddy will not apply them.",
		],
		[
			"a container routed by labels of its own",
			() => {
				containers.blog = {
					"Traefik.Enable": "True",
					"traefik.http.routers.blog.rule": "Host(`blog.test`)",
				};
			},
			"blog has Traefik labels that do not come from a domain in Dokploy: traefik.http.routers.blog.rule. Caddy will not apply them.",
		],
	])("finds %s", async (_, change, expected) => {
		change();
		expect(await found()).toEqual([expected]);
	});

	it("finds files, sections and static configuration Dokploy did not write", async () => {
		files["dynamic/app.yml"] = "tcp:\n  routers: {}";
		files["dynamic/mine.yml"] = "http: {}";
		files["traefik.yml"] += "\nexperimental:\n  plugins: {}\n";
		expect(await found()).toEqual([
			"dynamic/app.yml has a tcp section. Caddy will not apply it.",
			"dynamic/mine.yml was not written by Dokploy. Caddy will not read it.",
			"traefik.yml differs from the one Dokploy writes today. Caddy does not read that file.",
		]);
	});

	it("names the Requests page instead of calling its access log a hand edit", async () => {
		files["traefik.yml"] +=
			"\naccessLog:\n  filePath: /etc/dokploy/traefik/dynamic/access.log\n";
		expect(await found()).toEqual([
			"The Requests page reads Traefik's access log. It shows nothing new while Caddy serves.",
		]);
	});
});

describe("on the Dokploy host", () => {
	type Settings = typeof webServerSettings.$inferSelect;

	const file = `${paths().DYNAMIC_TRAEFIK_PATH}/dokploy.yml`;
	const read = () => fs.readFileSync(file, "utf8") as string;

	// The dashboard's Traefik file, as Dokploy's own writers leave it for these
	// settings.
	const configure = (settings: Partial<Settings>) => {
		vi.mocked(getWebServerSettings).mockResolvedValue(settings as Settings);
		if (settings.host) updateServerTraefik(settings as Settings, settings.host);
	};
	const found = () =>
		findHandWrittenTraefikConfig(
			null,
			[],
			new Map([
				["traefik.yml", getDefaultTraefikConfig()],
				["dynamic/dokploy.yml", read()],
			]),
			new Map(),
		);

	beforeEach(() => {
		vol.reset();
		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);
		createDefaultServerTraefikConfig();
	});

	it("finds nothing in the dashboard's router, with or without a domain", async () => {
		configure({});
		expect(await found()).toEqual([]);
		configure({ host: "panel.test", https: false, certificateType: "none" });
		expect(await found()).toEqual([]);
		configure({
			host: "panel.test",
			https: true,
			certificateType: "letsencrypt",
		});
		expect(await found()).toEqual([]);
	});

	it("finds an address restriction someone added to the dashboard's router", async () => {
		configure({
			host: "panel.test",
			https: true,
			certificateType: "letsencrypt",
		});
		fs.writeFileSync(
			file,
			read().replaceAll(
				"Host(`panel.test`)",
				"Host(`panel.test`) && ClientIP(`10.0.0.0/8`)",
			),
		);
		expect(await found()).toEqual([
			"dynamic/dokploy.yml: the router dokploy-router-app is not the one Dokploy writes for a domain. Caddy follows the database, not this file.",
			"dynamic/dokploy.yml: the router dokploy-router-app-secure is not the one Dokploy writes for a domain. Caddy follows the database, not this file.",
		]);
	});
});
