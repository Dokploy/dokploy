import { fs, vol } from "memfs";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

const execAsyncMock = vi.hoisted(() => vi.fn());
const execAsyncRemoteMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execAsyncMock,
	execAsyncRemote: execAsyncRemoteMock,
}));

import {
	type ApplicationNested,
	type CaddyRouteFragment,
	type CaddyRouteIntent,
	CLOUDFLARE_TRUSTED_PROXY_RANGES,
	caddyTrustedProxySettingsToConfig,
	compileAndWriteCaddyConfig,
	compileCaddyConfig,
	compileWriteAndReloadCaddyConfigSafely,
	compileWriteAndValidateCaddyConfigSafely,
	createCaddyDashboardRouteFragment,
	type Domain,
	getCaddyMigrationArtifactPaths,
	manageCaddyDomain,
	normalizeCaddyTrustedProxySettings,
	paths,
	readCaddyRouteFragments,
	removeCaddyDomain,
	updateServerCaddy,
	validateCaddyConfigFileWithImage,
	writeCaddyRouteFragment,
} from "@dokploy/server";
import type { webServerSettings } from "@dokploy/server/db/schema";
import { beforeEach, expect, test, vi } from "vitest";

const route = (
	overrides: Partial<CaddyRouteIntent> = {},
): CaddyRouteIntent => ({
	id: "app-route",
	source: "dokploy-application",
	hosts: ["example.com"],
	https: false,
	upstreams: ["http://app:3000"],
	...overrides,
});

const getServers = (config: ReturnType<typeof compileCaddyConfig>) => {
	const apps = config.apps as Record<string, any>;
	return apps.http.servers as Record<string, any>;
};

type WebServerSettings = typeof webServerSettings.$inferSelect;

const settings = (overrides: Partial<WebServerSettings> = {}) =>
	({
		id: "settings-1",
		webServerProvider: "caddy",
		caddyTrustedProxyConfig: null,
		requestLogsEnabled: false,
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
		remoteServersOnly: false,
		enforceSSO: false,
		cleanupCacheApplications: false,
		cleanupCacheOnCompose: false,
		cleanupCacheOnPreviews: false,
		createdAt: null,
		updatedAt: new Date(),
		...overrides,
	}) as WebServerSettings;

beforeEach(() => {
	vol.reset();
	execAsyncMock.mockReset();
	execAsyncRemoteMock.mockReset();
	execAsyncMock.mockResolvedValue({ stdout: "dokploy-caddy\n", stderr: "" });
	execAsyncRemoteMock.mockResolvedValue({
		stdout: "dokploy-caddy\n",
		stderr: "",
	});
});

test("compiles explicit http and https servers with managed HTTPS redirect", () => {
	const config = compileCaddyConfig({
		letsEncryptEmail: "ops@example.com",
		routes: [route({ https: true })],
	});

	const servers = getServers(config);
	expect(servers.http.listen).toEqual([":80"]);
	expect(servers.https.listen).toEqual([":443"]);
	expect(servers.metrics).toEqual({
		listen: [":2020"],
		routes: [
			{
				handle: [{ handler: "metrics" }],
				terminal: true,
			},
		],
	});
	expect(servers.http.routes[0].handle[0].handler).toBe("static_response");
	expect(servers.http.routes[0].handle[0].headers.Location).toEqual([
		"https://{http.request.host}{http.request.uri}",
	]);
	expect(servers.https.routes[0].handle.at(-1)).toMatchObject({
		handler: "reverse_proxy",
		upstreams: [{ dial: "app:3000" }],
	});
	expect((config.apps as any).tls.automation.policies[0].issuers[0].email).toBe(
		"ops@example.com",
	);
	expect(servers.http.trusted_proxies).toBeUndefined();
	expect(servers.https.trusted_proxies).toBeUndefined();
	expect(servers.http.client_ip_headers).toBeUndefined();
	expect(servers.https.client_ip_headers).toBeUndefined();
	expect((config as any).logging).toBeUndefined();
	expect(servers.http.logs).toBeUndefined();
	expect(servers.https.logs).toBeUndefined();
});

test("compiles Caddy access-log output when request analytics are enabled", () => {
	const config = compileCaddyConfig({
		routes: [route({ https: true })],
		accessLogs: { enabled: true },
	});

	const servers = getServers(config);
	expect(servers.http.logs).toEqual({});
	expect(servers.https.logs).toEqual({});
	expect((config as any).logging.logs["dokploy-requests"]).toEqual({
		writer: {
			output: "file",
			filename: "/etc/caddy/access.log",
		},
		encoder: {
			format: "json",
		},
		include: ["http.log.access"],
	});
});

test("dashboard Caddy updates preserve enabled request access logs", async () => {
	await updateServerCaddy(
		settings({
			requestLogsEnabled: true,
			https: true,
			letsEncryptEmail: "ops@example.com",
			caddyTrustedProxyConfig: {
				mode: "static",
				ranges: ["192.0.2.0/24"],
				clientIpHeaders: ["X-Forwarded-For"],
				strict: true,
			},
		}),
		"dashboard.example.com",
	);

	const config = JSON.parse(
		vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8") as string,
	);
	const servers = (config.apps as Record<string, any>).http.servers;

	expect(servers.http.logs).toEqual({});
	expect(servers.http.trusted_proxies).toEqual({
		source: "static",
		ranges: ["192.0.2.0/24"],
	});
	expect(servers.http.client_ip_headers).toEqual(["X-Forwarded-For"]);
	expect(servers.https.trusted_proxies).toEqual(servers.http.trusted_proxies);
	expect((config.apps as any).tls.automation.policies[0].issuers[0].email).toBe(
		"ops@example.com",
	);
	expect((config as any).logging.logs["dokploy-requests"]).toEqual({
		writer: {
			output: "file",
			filename: "/etc/caddy/access.log",
		},
		encoder: {
			format: "json",
		},
		include: ["http.log.access"],
	});
});

test("restores dashboard fragments when Caddy dashboard reload fails", async () => {
	const existingFragment = createCaddyDashboardRouteFragment(
		settings(),
		"old-dashboard.example.com",
	);
	const concurrentFragment: CaddyRouteFragment = {
		version: 1,
		id: "application.concurrent",
		source: "dokploy-application",
		routes: [route({ id: "concurrent", hosts: ["concurrent.example.com"] })],
	};
	await writeCaddyRouteFragment(existingFragment);
	const previousConfig = `${JSON.stringify(
		compileCaddyConfig({ fragments: [existingFragment] }),
		null,
		2,
	)}\n`;
	vol.mkdirSync(paths().MAIN_CADDY_PATH, { recursive: true });
	vol.writeFileSync(paths().CADDY_CONFIG_PATH, previousConfig);
	let concurrentFragmentWritten = false;
	execAsyncMock.mockImplementation(async (command: string) => {
		if (command.includes("caddy validate")) {
			if (!concurrentFragmentWritten) {
				concurrentFragmentWritten = true;
				await writeCaddyRouteFragment(concurrentFragment);
			}
			throw new Error("validation failed");
		}
		return { stdout: "dokploy-caddy\n", stderr: "" };
	});

	await expect(
		updateServerCaddy(settings(), "new-dashboard.example.com"),
	).rejects.toThrow("validation failed");

	expect(await readCaddyRouteFragments()).toEqual([
		concurrentFragment,
		existingFragment,
	]);
	expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
		previousConfig,
	);
});

test("does not overwrite a concurrent dashboard fragment update when dashboard reload fails", async () => {
	const existingFragment = createCaddyDashboardRouteFragment(
		settings(),
		"old-dashboard.example.com",
	);
	const concurrentDashboardFragment = createCaddyDashboardRouteFragment(
		settings(),
		"concurrent-dashboard.example.com",
	);
	await writeCaddyRouteFragment(existingFragment);
	const previousConfig = `${JSON.stringify(
		compileCaddyConfig({ fragments: [existingFragment] }),
		null,
		2,
	)}\n`;
	const concurrentConfig = `${JSON.stringify(
		compileCaddyConfig({ fragments: [concurrentDashboardFragment] }),
		null,
		2,
	)}\n`;
	vol.mkdirSync(paths().MAIN_CADDY_PATH, { recursive: true });
	vol.writeFileSync(paths().CADDY_CONFIG_PATH, previousConfig);
	let failedInitialValidation = false;
	execAsyncMock.mockImplementation(async (command: string) => {
		if (command.includes("caddy validate") && !failedInitialValidation) {
			failedInitialValidation = true;
			await writeCaddyRouteFragment(concurrentDashboardFragment);
			throw new Error("validation failed");
		}
		return { stdout: "dokploy-caddy\n", stderr: "" };
	});

	await expect(
		updateServerCaddy(settings(), "new-dashboard.example.com"),
	).rejects.toThrow("validation failed");

	expect(await readCaddyRouteFragments()).toEqual([
		concurrentDashboardFragment,
	]);
	expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
		concurrentConfig,
	);
});

test("restores removed dashboard fragments when Caddy dashboard removal reload fails", async () => {
	const existingFragment = createCaddyDashboardRouteFragment(
		settings(),
		"old-dashboard.example.com",
	);
	await writeCaddyRouteFragment(existingFragment);
	const previousConfig = `${JSON.stringify(
		compileCaddyConfig({ fragments: [existingFragment] }),
		null,
		2,
	)}\n`;
	vol.mkdirSync(paths().MAIN_CADDY_PATH, { recursive: true });
	vol.writeFileSync(paths().CADDY_CONFIG_PATH, previousConfig);
	execAsyncMock.mockImplementation(async (command: string) => {
		if (command.includes("caddy validate")) {
			throw new Error("validation failed");
		}
		return { stdout: "dokploy-caddy\n", stderr: "" };
	});

	await expect(updateServerCaddy(settings(), null)).rejects.toThrow(
		"validation failed",
	);

	expect(await readCaddyRouteFragments()).toEqual([existingFragment]);
	expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
		previousConfig,
	);
});

test("compiles Cloudflare trusted proxy settings with safe client IP headers", () => {
	const config = compileCaddyConfig({
		routes: [route({ https: true })],
		trustedProxies: {
			source: "cloudflare",
		},
	});

	const servers = getServers(config);
	for (const server of [servers.http, servers.https]) {
		expect(server.trusted_proxies).toEqual({
			source: "static",
			ranges: [...CLOUDFLARE_TRUSTED_PROXY_RANGES],
		});
		expect(server.client_ip_headers).toEqual([
			"CF-Connecting-IP",
			"X-Forwarded-For",
		]);
		// Caddy's trusted_proxies_strict is an int field; booleans fail
		// `caddy validate`.
		expect(server.trusted_proxies_strict).toBe(1);
	}
});

test("compiles custom static trusted proxy ranges", () => {
	const config = compileCaddyConfig({
		routes: [route()],
		trustedProxies: {
			source: "static",
			ranges: ["192.0.2.0/24", "2001:db8::/32"],
			clientIpHeaders: ["X-Forwarded-For"],
			strict: false,
		},
	});

	const servers = getServers(config);
	expect(servers.http).toMatchObject({
		trusted_proxies: {
			source: "static",
			ranges: ["192.0.2.0/24", "2001:db8::/32"],
		},
		client_ip_headers: ["X-Forwarded-For"],
	});
	expect(servers.http.trusted_proxies_strict).toBeUndefined();
	expect(servers.https.trusted_proxies).toEqual(servers.http.trusted_proxies);
});

test("normalizes persisted Caddy trusted proxy settings", () => {
	const settings = normalizeCaddyTrustedProxySettings({
		mode: "static",
		ranges: [" 192.0.2.0/24 ", "192.0.2.0/24"],
		clientIpHeaders: [" X-Forwarded-For ", ""],
		strict: null,
	});

	expect(settings).toEqual({
		mode: "static",
		ranges: ["192.0.2.0/24"],
		clientIpHeaders: ["X-Forwarded-For"],
		strict: true,
	});
	expect(caddyTrustedProxySettingsToConfig(settings)).toEqual({
		source: "static",
		ranges: ["192.0.2.0/24"],
		clientIpHeaders: ["X-Forwarded-For"],
		strict: true,
	});
	expect(normalizeCaddyTrustedProxySettings({ mode: "disabled" })).toBeNull();
});

test("rejects invalid trusted proxy settings before writing Caddy config", () => {
	expect(() =>
		compileCaddyConfig({
			trustedProxies: { source: "static", ranges: ["192.0.2.0/33"] },
		}),
	).toThrow("Invalid Caddy trusted proxy prefix");

	expect(() =>
		compileCaddyConfig({
			trustedProxies: {
				source: "static",
				ranges: ["192.0.2.0/24"],
				clientIpHeaders: ["X-Forwarded-For", "x-forwarded-for"],
			},
		}),
	).toThrow("Duplicate Caddy trusted proxy client IP header");
});

test("sorts routes by priority before path specificity and stable id", () => {
	const config = compileCaddyConfig({
		routes: [
			route({ id: "low-specific", priority: 1, pathPrefix: "/very/specific" }),
			route({ id: "high-priority", priority: 10, pathPrefix: "/api" }),
			route({ id: "same-priority-longer", priority: 1, pathPrefix: "/longer" }),
			route({
				id: "same-tiebreak-b",
				priority: 1,
				pathPrefix: "/same",
				upstreams: ["http://b:3000"],
			}),
			route({
				id: "same-tiebreak-a",
				priority: 1,
				pathPrefix: "/same",
				upstreams: ["http://a:3000"],
			}),
		],
	});

	const [first, second, third, fourth, fifth] = getServers(config).http.routes;
	expect(first.match[0].path).toEqual(["/api*"]);
	expect(second.match[0].path).toEqual(["/very/specific*"]);
	expect(third.match[0].path).toEqual(["/longer*"]);
	expect(fourth.handle.at(-1).upstreams).toEqual([{ dial: "a:3000" }]);
	expect(fifth.handle.at(-1).upstreams).toEqual([{ dial: "b:3000" }]);
});

test("orders migrated manual and Traefik routes before DB fallbacks for identical catch-all matches", () => {
	const config = compileCaddyConfig({
		routes: [
			route({
				id: "db-compose-fallback",
				source: "dokploy-compose",
				https: true,
				upstreams: ["http://cms:3000"],
			}),
			route({
				id: "manual-waf",
				source: "manual",
				https: true,
				upstreams: ["http://waf:8080"],
			}),
			route({
				id: "dynamic-blog",
				source: "traefik-dynamic-file",
				https: true,
				upstreams: ["http://blog:8080"],
			}),
			route({
				id: "label-cms",
				source: "traefik-compose-label",
				https: true,
				upstreams: ["http://cms:80"],
			}),
		],
	});

	const upstreamOrder = getServers(config).https.routes.map(
		(compiledRoute: any) => compiledRoute.handle.at(-1).upstreams[0].dial,
	);
	expect(upstreamOrder).toEqual([
		"waf:8080",
		"cms:80",
		"blog:8080",
		"cms:3000",
	]);
});

test("renders transforms, headers, and HTTPS upstream transport", () => {
	const config = compileCaddyConfig({
		routes: [
			route({
				upstreams: ["https://upstream.example.com:443"],
				transforms: {
					stripPrefix: "/public",
					addPrefix: "/internal",
					responseHeaders: {
						"Cache-Control": "no-store",
					},
				},
			}),
		],
	});

	const handlers = getServers(config).http.routes[0].handle;
	expect(handlers[0]).toMatchObject({
		handler: "headers",
		response: { set: { "Cache-Control": ["no-store"] } },
	});
	expect(handlers[1]).toMatchObject({
		handler: "rewrite",
		strip_path_prefix: "/public",
	});
	expect(handlers[2]).toMatchObject({
		handler: "rewrite",
		uri: "/internal{http.request.uri.path}",
	});
	expect(handlers[3]).toMatchObject({
		handler: "reverse_proxy",
		upstreams: [{ dial: "upstream.example.com:443" }],
		transport: { protocol: "http", tls: {} },
	});
});

test("rejects proxy upstreams without explicit valid ports", () => {
	for (const upstream of [
		"http://admin",
		"https://external.example.com",
		"http://app:0",
		"http://app:65536",
		"http://app:abc",
		"app",
		"app:0",
	]) {
		expect(() =>
			compileCaddyConfig({
				routes: [route({ upstreams: [upstream] })],
			}),
		).toThrow(`invalid upstream "${upstream}"`);
	}
});

test("allows redirect-only routes without upstreams", () => {
	const config = compileCaddyConfig({
		routes: [
			route({
				upstreams: [],
				redirectScheme: { scheme: "https", permanent: true },
			}),
		],
	});

	expect(getServers(config).http.routes[0].handle[0]).toMatchObject({
		handler: "static_response",
		status_code: 308,
	});
});

test("allows static response routes without upstreams", () => {
	const config = compileCaddyConfig({
		routes: [
			route({
				source: "manual",
				https: true,
				upstreams: [],
				staticResponse: {
					statusCode: 404,
					headers: {
						"Cache-Control": "no-store",
					},
				},
			}),
		],
	});

	const servers = getServers(config);
	expect(servers.http.routes[0].handle[0]).toMatchObject({
		handler: "static_response",
		status_code: 308,
	});
	expect(servers.https.routes[0].handle).toEqual([
		{
			handler: "static_response",
			status_code: 404,
			headers: {
				"Cache-Control": ["no-store"],
			},
		},
	]);
});

test("stores fragments and compiles them into the active config", async () => {
	const fragment: CaddyRouteFragment = {
		version: 1,
		id: "app.example",
		source: "dokploy-application",
		routes: [route({ id: "stored", pathPrefix: "/stored" })],
	};

	await writeCaddyRouteFragment(fragment);
	const fragments = await readCaddyRouteFragments();
	const config = await compileAndWriteCaddyConfig();

	expect(fragments).toEqual([fragment]);
	expect(getServers(config).http.routes[0].match[0].path).toEqual(["/stored*"]);
});

test("rejects invalid fragment ids before touching the store", async () => {
	for (const id of ["../bad", "..", ".", "bad..segment"]) {
		await expect(
			writeCaddyRouteFragment({
				version: 1,
				id,
				source: "manual",
				routes: [route()],
			}),
		).rejects.toThrow("Invalid Caddy fragment id");
	}
	expect(vol.existsSync(paths().CADDY_FRAGMENTS_PATH)).toBe(false);
});

test("rejects unsafe Caddy migration ids", () => {
	for (const id of ["..", ".", "bad..segment"]) {
		expect(() => getCaddyMigrationArtifactPaths(id)).toThrow(
			"Invalid Caddy migration id",
		);
	}
});

test("validates a config file with the Caddy binary in an isolated runtime container", async () => {
	await validateCaddyConfigFileWithImage(
		"/etc/dokploy/caddy/migrations/test/caddy.json",
	);

	const validateCommand = execAsyncMock.mock.calls
		.map(([command]) => command as string)
		.find((command) => command.includes("docker run"));
	expect(validateCommand).toContain("docker run --rm --network none");
	expect(validateCommand).toContain("caddy\\:2.11.4");
	expect(validateCommand).toContain(
		"/etc/dokploy/caddy/migrations/test/caddy.json\\:/etc/caddy/caddy.json\\:ro",
	);
	expect(validateCommand).toContain(
		"/etc/dokploy/caddy/migrations/test/.validate-runtime/config\\:/config",
	);
	expect(validateCommand).toContain(
		`${paths().CERTIFICATES_PATH}\\:${paths().CERTIFICATES_PATH}\\:ro`,
	);
	expect(validateCommand).toContain(" caddy validate --config");
	expect(validateCommand).not.toContain("caddy\\:2.11.4 validate --config");
});

test("restores the previous Caddy config when safe validation fails without reloading", async () => {
	const previousConfig = `${JSON.stringify(
		compileCaddyConfig({ routes: [route({ hosts: ["old.example.com"] })] }),
		null,
		2,
	)}\n`;
	vol.mkdirSync(paths().MAIN_CADDY_PATH, { recursive: true });
	vol.mkdirSync(paths().CADDY_FRAGMENTS_PATH, { recursive: true });
	vol.writeFileSync(paths().CADDY_CONFIG_PATH, previousConfig);
	execAsyncMock.mockImplementation(async (command: string) => {
		if (command.includes("caddy validate")) {
			throw new Error("validation failed");
		}
		return { stdout: "dokploy-caddy\n", stderr: "" };
	});
	const consoleError = vi
		.spyOn(console, "error")
		.mockImplementation(() => undefined);

	await expect(
		compileWriteAndValidateCaddyConfigSafely({
			accessLogs: { enabled: true },
		}),
	).rejects.toThrow("validation failed");

	expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
		previousConfig,
	);
	expect(
		execAsyncMock.mock.calls.some(([command]) =>
			(command as string).includes("caddy reload"),
		),
	).toBe(false);
	consoleError.mockRestore();
});

test("reloads the restored Caddy config when safe reload fails", async () => {
	const previousConfig = `${JSON.stringify(
		compileCaddyConfig({ routes: [route({ hosts: ["old.example.com"] })] }),
		null,
		2,
	)}\n`;
	vol.mkdirSync(paths().MAIN_CADDY_PATH, { recursive: true });
	vol.mkdirSync(paths().CADDY_FRAGMENTS_PATH, { recursive: true });
	vol.writeFileSync(paths().CADDY_CONFIG_PATH, previousConfig);
	let reloads = 0;
	execAsyncMock.mockImplementation(async (command: string) => {
		if (command.includes("caddy reload")) {
			reloads += 1;
			if (reloads === 1) {
				throw new Error("reload failed");
			}
		}
		return { stdout: "dokploy-caddy\n", stderr: "" };
	});

	await expect(
		compileWriteAndReloadCaddyConfigSafely({
			trustedProxies: {
				source: "static",
				ranges: ["192.0.2.0/24"],
			},
		}),
	).rejects.toThrow("reload failed");

	expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
		previousConfig,
	);
	expect(reloads).toBe(2);
});

test("preserves the original safe reload error when the restored Caddy reload also fails", async () => {
	const previousConfig = `${JSON.stringify(
		compileCaddyConfig({ routes: [route({ hosts: ["old.example.com"] })] }),
		null,
		2,
	)}\n`;
	vol.mkdirSync(paths().MAIN_CADDY_PATH, { recursive: true });
	vol.mkdirSync(paths().CADDY_FRAGMENTS_PATH, { recursive: true });
	vol.writeFileSync(paths().CADDY_CONFIG_PATH, previousConfig);
	const restoreError = new Error("restored reload failed");
	let reloads = 0;
	execAsyncMock.mockImplementation(async (command: string) => {
		if (command.includes("caddy reload")) {
			reloads += 1;
			if (reloads === 1) {
				throw new Error("new config reload failed");
			}
			throw restoreError;
		}
		return { stdout: "dokploy-caddy\n", stderr: "" };
	});
	const consoleError = vi
		.spyOn(console, "error")
		.mockImplementation(() => undefined);

	let thrownError: Error | undefined;
	try {
		await compileWriteAndReloadCaddyConfigSafely({
			trustedProxies: {
				source: "static",
				ranges: ["192.0.2.0/24"],
			},
		});
	} catch (error) {
		thrownError = error as Error;
	}

	expect(thrownError).toBeInstanceOf(Error);
	expect(thrownError?.message).toBe("new config reload failed");
	expect((thrownError as Error & { restoreError?: unknown }).restoreError).toBe(
		restoreError,
	);
	expect(consoleError).toHaveBeenCalledWith(
		"Failed to restore Caddy config:",
		restoreError,
	);
	consoleError.mockRestore();
	expect(vol.readFileSync(paths().CADDY_CONFIG_PATH, "utf8")).toBe(
		previousConfig,
	);
	expect(reloads).toBe(2);
});

test("restores previous fragments when Caddy domain reload fails", async () => {
	const existingFragment: CaddyRouteFragment = {
		version: 1,
		id: "app.existing",
		source: "dokploy-application",
		routes: [route({ id: "existing", hosts: ["old.example.com"] })],
	};
	await writeCaddyRouteFragment(existingFragment);
	execAsyncMock.mockImplementation(async (command: string) => {
		if (command.includes("caddy validate")) {
			throw new Error("validation failed");
		}
		return { stdout: "dokploy-caddy\n", stderr: "" };
	});

	await expect(
		manageCaddyDomain(
			{ appName: "my-app", serverId: null } as ApplicationNested,
			{
				domainId: "domain-1",
				applicationId: "app-1",
				composeId: null,
				previewDeploymentId: null,
				domainType: "application",
				host: "example.com",
				path: "/",
				internalPath: "/",
				stripPath: false,
				https: false,
				certificateType: "none",
				customCertResolver: null,
				customEntrypoint: null,
				middlewares: null,
				port: 3000,
				serviceName: null,
				uniqueConfigKey: 7,
				createdAt: "",
			} as Domain,
		),
	).rejects.toThrow("validation failed");

	expect(await readCaddyRouteFragments()).toEqual([existingFragment]);
});

test("restores removed fragments when Caddy domain removal reload fails", async () => {
	const existingFragment: CaddyRouteFragment = {
		version: 1,
		id: "application.my-app.7",
		source: "dokploy-application",
		routes: [route({ id: "existing", hosts: ["old.example.com"] })],
	};
	await writeCaddyRouteFragment(existingFragment);
	execAsyncMock.mockImplementation(async (command: string) => {
		if (command.includes("caddy validate")) {
			throw new Error("validation failed");
		}
		return { stdout: "dokploy-caddy\n", stderr: "" };
	});

	await expect(
		removeCaddyDomain(
			{ appName: "my-app", serverId: null } as ApplicationNested,
			7,
		),
	).rejects.toThrow("validation failed");

	expect(await readCaddyRouteFragments()).toEqual([existingFragment]);
});
