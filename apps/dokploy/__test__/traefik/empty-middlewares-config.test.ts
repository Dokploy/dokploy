import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested, Redirect, Security } from "@dokploy/server";
import { createRedirectMiddleware } from "@dokploy/server/utils/traefik/redirect";
import { createSecurityMiddleware } from "@dokploy/server/utils/traefik/security";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

// Keep the security test fast and free of native-module wiring by stubbing
// bcrypt.hash. security.ts only needs a deterministic `username:hash` string.
vi.mock("bcrypt", () => ({
	hash: vi.fn(async () => "hashed-password"),
}));

const remoteMocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
	writeFileRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...actual,
		execAsyncRemote: remoteMocks.execAsyncRemote,
		writeFileRemote: remoteMocks.writeFileRemote,
	};
});

const APP_NAME = "my-app";
const DYNAMIC_REL = path.join(".docker", "traefik", "dynamic");
const EMPTY_YAML = "{}\n";

const makeApp = (serverId = ""): ApplicationNested =>
	({ appName: APP_NAME, serverId }) as unknown as ApplicationNested;

const makeRedirect = (uniqueConfigKey: number): Redirect =>
	({
		redirectId: `r-${uniqueConfigKey}`,
		regex: `^https?://${APP_NAME}\\.example\\.com/old/(.*)`,
		replacement: `https://${APP_NAME}.example.com/new/$1`,
		permanent: true,
		uniqueConfigKey,
		createdAt: "",
		applicationId: "app-1",
	}) as unknown as Redirect;

const makeSecurity = (username: string): Security =>
	({
		securityId: "sec-1",
		username,
		password: "super-secret",
		createdAt: "",
		applicationId: "app-1",
	}) as unknown as Security;

// A domain-bearing app config: at least one HTTP router so writeAppTraefikConfig
// persists the file (it deletes the file only when routers AND services are empty).
const appConfigYaml = (appName: string) =>
	stringify({
		http: {
			routers: {
				[`${appName}-router-1`]: {
					rule: `Host(\`${appName}.example.com\`)`,
					service: `${appName}-service-1`,
					entryPoints: ["web"],
				},
			},
			services: {
				[`${appName}-service-1`]: {
					loadBalancer: {
						servers: [{ url: `http://${appName}:3000` }],
						passHostHeader: true,
					},
				},
			},
		},
	});

// Returns every middleware name referenced by any router in an app config.
const referencedMiddlewareNames = (appConfig: {
	http?: { routers?: Record<string, { middlewares?: string[] }> };
}): string[] => {
	const names = new Set<string>();
	for (const router of Object.values(appConfig.http?.routers ?? {})) {
		for (const m of router.middlewares ?? []) {
			names.add(m);
		}
	}
	return [...names];
};

describe("createRedirectMiddleware with empty middlewares.yml ({})", () => {
	let cwd: string;
	let dynamicPath: string;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-redirect-"));
		dynamicPath = path.join(cwd, DYNAMIC_REL);
		fs.mkdirSync(dynamicPath, { recursive: true });
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		fs.writeFileSync(
			path.join(dynamicPath, "middlewares.yml"),
			EMPTY_YAML,
			"utf8",
		);
		fs.writeFileSync(
			path.join(dynamicPath, `${APP_NAME}.yml`),
			appConfigYaml(APP_NAME),
			"utf8",
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("persists the redirectRegex middleware to middlewares.yml even when the file is {}", async () => {
		await createRedirectMiddleware(makeApp(), makeRedirect(1));

		const middlewares = parse(
			fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"),
		) as { http?: { middlewares?: Record<string, unknown> } };
		const name = "redirect-my-app-1";
		expect(middlewares.http?.middlewares?.[name]).toEqual({
			redirectRegex: {
				regex: "^https?://my-app\\.example\\.com/old/(.*)",
				replacement: "https://my-app.example.com/new/$1",
				permanent: true,
			},
		});
	});

	it("does not leave a dangling reference: every router middleware exists in middlewares.yml", async () => {
		await createRedirectMiddleware(makeApp(), makeRedirect(1));

		const middlewares = parse(
			fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"),
		) as { http?: { middlewares?: Record<string, unknown> } };
		const appConfig = parse(
			fs.readFileSync(path.join(dynamicPath, `${APP_NAME}.yml`), "utf8"),
		) as { http?: { routers?: Record<string, { middlewares?: string[] }> } };

		for (const name of referencedMiddlewareNames(appConfig)) {
			expect(
				middlewares.http?.middlewares?.[name],
				`middleware "${name}" is referenced by the router but missing from middlewares.yml`,
			).toBeDefined();
		}
		expect(
			appConfig.http?.routers?.[`${APP_NAME}-router-1`]?.middlewares,
		).toContain("redirect-my-app-1");
	});

	it("materializes http.middlewares when http exists but middlewares is absent", async () => {
		fs.writeFileSync(
			path.join(dynamicPath, "middlewares.yml"),
			stringify({ http: {} }),
			"utf8",
		);

		await createRedirectMiddleware(makeApp(), makeRedirect(2));

		const middlewares = parse(
			fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"),
		) as { http?: { middlewares?: Record<string, unknown> } };
		expect(middlewares.http?.middlewares?.["redirect-my-app-2"]).toBeDefined();
	});

	it("preserves pre-existing middlewares when adding a new redirect", async () => {
		fs.writeFileSync(
			path.join(dynamicPath, "middlewares.yml"),
			stringify({
				http: {
					middlewares: {
						"redirect-to-https": { redirectScheme: { scheme: "https" } },
					},
				},
			}),
			"utf8",
		);

		await createRedirectMiddleware(makeApp(), makeRedirect(1));

		const middlewares = parse(
			fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"),
		) as { http?: { middlewares?: Record<string, unknown> } };
		expect(middlewares.http?.middlewares?.["redirect-to-https"]).toBeDefined();
		expect(middlewares.http?.middlewares?.["redirect-my-app-1"]).toBeDefined();
	});

	it("persists two redirects created sequentially from an empty {}", async () => {
		await createRedirectMiddleware(makeApp(), makeRedirect(1));
		await createRedirectMiddleware(makeApp(), makeRedirect(2));

		const middlewares = parse(
			fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"),
		) as { http?: { middlewares?: Record<string, unknown> } };
		expect(middlewares.http?.middlewares?.["redirect-my-app-1"]).toBeDefined();
		expect(middlewares.http?.middlewares?.["redirect-my-app-2"]).toBeDefined();
	});
});

describe("createSecurityMiddleware with empty middlewares.yml ({})", () => {
	let cwd: string;
	let dynamicPath: string;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-security-"));
		dynamicPath = path.join(cwd, DYNAMIC_REL);
		fs.mkdirSync(dynamicPath, { recursive: true });
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		fs.writeFileSync(
			path.join(dynamicPath, "middlewares.yml"),
			EMPTY_YAML,
			"utf8",
		);
		fs.writeFileSync(
			path.join(dynamicPath, `${APP_NAME}.yml`),
			appConfigYaml(APP_NAME),
			"utf8",
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("persists the basicAuth middleware to middlewares.yml even when the file is {}", async () => {
		await createSecurityMiddleware(makeApp(), makeSecurity("alice"));

		const middlewares = parse(
			fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"),
		) as {
			http?: {
				middlewares?: Record<
					string,
					{ basicAuth?: { users?: string[]; removeHeader?: boolean } }
				>;
			};
		};
		const mw = middlewares.http?.middlewares?.[`auth-${APP_NAME}`];
		expect(mw?.basicAuth?.users).toContain("alice:hashed-password");
		expect(mw?.basicAuth?.removeHeader).toBe(true);
	});

	it("does not leave a dangling reference for the auth middleware", async () => {
		await createSecurityMiddleware(makeApp(), makeSecurity("alice"));

		const middlewares = parse(
			fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"),
		) as { http?: { middlewares?: Record<string, unknown> } };
		const appConfig = parse(
			fs.readFileSync(path.join(dynamicPath, `${APP_NAME}.yml`), "utf8"),
		) as { http?: { routers?: Record<string, { middlewares?: string[] }> } };

		for (const name of referencedMiddlewareNames(appConfig)) {
			expect(
				middlewares.http?.middlewares?.[name],
				`middleware "${name}" is referenced by the router but missing from middlewares.yml`,
			).toBeDefined();
		}
		expect(
			appConfig.http?.routers?.[`${APP_NAME}-router-1`]?.middlewares,
		).toContain(`auth-${APP_NAME}`);
	});

	it("appends a new user to an existing basicAuth middleware instead of dropping it", async () => {
		await createSecurityMiddleware(makeApp(), makeSecurity("alice"));
		await createSecurityMiddleware(makeApp(), makeSecurity("bob"));

		const middlewares = parse(
			fs.readFileSync(path.join(dynamicPath, "middlewares.yml"), "utf8"),
		) as {
			http?: {
				middlewares?: Record<
					string,
					{ basicAuth?: { users?: string[]; removeHeader?: boolean } }
				>;
			};
		};
		const users =
			middlewares.http?.middlewares?.[`auth-${APP_NAME}`]?.basicAuth?.users;
		expect(users).toEqual(["alice:hashed-password", "bob:hashed-password"]);
	});
});

describe("createRedirectMiddleware remote branch (serverId set)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		remoteMocks.execAsyncRemote.mockImplementation(
			async (_serverId, command) => {
				const cmd = String(command);
				if (cmd.includes("middlewares.yml")) {
					return { stdout: EMPTY_YAML, stderr: "" };
				}
				if (cmd.includes(`${APP_NAME}.yml`)) {
					return { stdout: appConfigYaml(APP_NAME), stderr: "" };
				}
				return { stdout: "", stderr: "" };
			},
		);
		remoteMocks.writeFileRemote.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("persists the redirect middleware remotely when middlewares.yml is {}", async () => {
		await createRedirectMiddleware(makeApp("server-1"), makeRedirect(1));

		const middlewaresWrite = remoteMocks.writeFileRemote.mock.calls.find((c) =>
			String(c[1]).includes("middlewares.yml"),
		);
		expect(
			middlewaresWrite,
			"middlewares.yml was never written remotely",
		).toBeTruthy();
		const written = parse(String(middlewaresWrite?.[2])) as {
			http?: { middlewares?: Record<string, unknown> };
		};
		expect(written.http?.middlewares?.["redirect-my-app-1"]).toBeDefined();
	});

	it("writes the per-app config with a router middleware that exists in the remote middlewares.yml", async () => {
		await createRedirectMiddleware(makeApp("server-1"), makeRedirect(1));

		const middlewaresWrite = remoteMocks.writeFileRemote.mock.calls.find((c) =>
			String(c[1]).includes("middlewares.yml"),
		);
		const appWrite = remoteMocks.writeFileRemote.mock.calls.find((c) =>
			String(c[1]).includes(`${APP_NAME}.yml`),
		);
		expect(middlewaresWrite).toBeTruthy();
		expect(appWrite).toBeTruthy();

		const middlewares = parse(String(middlewaresWrite?.[2])) as {
			http?: { middlewares?: Record<string, unknown> };
		};
		const appConfig = parse(String(appWrite?.[2])) as {
			http?: { routers?: Record<string, { middlewares?: string[] }> };
		};
		for (const name of referencedMiddlewareNames(appConfig)) {
			expect(
				middlewares.http?.middlewares?.[name],
				`remote router references missing middleware "${name}"`,
			).toBeDefined();
		}
	});
});
