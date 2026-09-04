import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested } from "@dokploy/server";
import type { Security } from "@dokploy/server/services/security";
import type { FileConfig } from "@dokploy/server/utils/traefik/file-types";
import { replaceSecurityMiddlewareUser } from "@dokploy/server/utils/traefik/security";
import * as bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

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

const OLD: Security = {
	securityId: "sec-1",
	username: "alice",
	password: "oldpass",
	applicationId: "app-1",
	createdAt: "2024-01-01",
};

const initialMiddlewares = (users: string[]): FileConfig => ({
	http: {
		middlewares: {
			"auth-myapp": {
				basicAuth: { removeHeader: true, users },
			},
		},
	},
});

const initialAppConfig = (): FileConfig => ({
	http: {
		routers: {
			"myapp-router-1": {
				rule: "Host(`x`)",
				service: "myapp-service",
				middlewares: ["auth-myapp"],
			},
		},
		services: {
			"myapp-service": {
				loadBalancer: {
					servers: [{ url: "http://myapp:3000" }],
					passHostHeader: true,
				},
			},
		},
	},
});

type BasicAuthMW = {
	basicAuth?: { removeHeader?: boolean; users?: string[] };
};

const hashOf = (line: string): string => line.split(":")[1] ?? "";

const readUsers = (file: string): string[] => {
	const parsed = parse(fs.readFileSync(file, "utf8")) as FileConfig;
	const mw = parsed.http?.middlewares?.["auth-myapp"] as
		| BasicAuthMW
		| undefined;
	return mw?.basicAuth?.users ?? [];
};

describe("replaceSecurityMiddlewareUser (local filesystem)", () => {
	let cwd: string;
	let dynamicPath: string;
	let middlewaresPath: string;
	let appConfigPath: string;

	const APP_LOCAL = {
		applicationId: "app-1",
		appName: "myapp",
		serverId: null,
	} as unknown as ApplicationNested;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-security-"));
		dynamicPath = path.join(cwd, ".docker", "traefik", "dynamic");
		fs.mkdirSync(dynamicPath, { recursive: true });
		middlewaresPath = path.join(dynamicPath, "middlewares.yml");
		appConfigPath = path.join(dynamicPath, "myapp.yml");
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("replaces the old username's hash with the new one in a single write (rename)", async () => {
		fs.writeFileSync(
			middlewaresPath,
			stringify(initialMiddlewares(["alice:oldhash", "carol:carolhash"])),
			"utf8",
		);
		fs.writeFileSync(appConfigPath, stringify(initialAppConfig()), "utf8");

		const newSecurity: Security = {
			...OLD,
			username: "bob",
			password: "newpass",
		};

		await replaceSecurityMiddlewareUser(APP_LOCAL, OLD, newSecurity);

		const users = readUsers(middlewaresPath);
		expect(users).not.toContain("alice:oldhash");
		expect(users).toContain("carol:carolhash");
		const bobLine = users.find((u) => u.startsWith("bob:"));
		expect(bobLine).toBeDefined();
		const [name, hash = ""] = bobLine!.split(":");
		expect(name).toBe("bob");
		expect(await bcrypt.compare("newpass", hash)).toBe(true);
		expect(await bcrypt.compare("oldpass", hash)).toBe(false);

		const appCfg = parse(fs.readFileSync(appConfigPath, "utf8")) as FileConfig;
		expect(appCfg.http?.routers?.["myapp-router-1"]?.middlewares).toContain(
			"auth-myapp",
		);
	});

	it("replaces only the hash when the username is unchanged (password rotation)", async () => {
		fs.writeFileSync(
			middlewaresPath,
			stringify(initialMiddlewares(["alice:oldhash", "carol:carolhash"])),
			"utf8",
		);
		fs.writeFileSync(appConfigPath, stringify(initialAppConfig()), "utf8");

		const newSecurity: Security = {
			...OLD,
			username: "alice",
			password: "newpass",
		};

		await replaceSecurityMiddlewareUser(APP_LOCAL, OLD, newSecurity);

		const users = readUsers(middlewaresPath);
		expect(users).not.toContain("alice:oldhash");
		expect(users).toContain("carol:carolhash");
		const aliceLine = users.find((u) => u.startsWith("alice:"));
		expect(aliceLine).toBeDefined();
		expect(await bcrypt.compare("newpass", hashOf(aliceLine!))).toBe(true);
		expect(await bcrypt.compare("oldpass", hashOf(aliceLine!))).toBe(false);
		expect(users).toHaveLength(2);
	});

	it("creates the basicAuth middleware entry if it does not yet exist", async () => {
		const otherMiddlewares: FileConfig = {
			http: {
				middlewares: {
					"redirect-other": { redirectScheme: { scheme: "https" } },
				},
			},
		};
		fs.writeFileSync(middlewaresPath, stringify(otherMiddlewares), "utf8");
		fs.writeFileSync(appConfigPath, stringify(initialAppConfig()), "utf8");

		const newSecurity: Security = {
			...OLD,
			username: "bob",
			password: "newpass",
		};

		await replaceSecurityMiddlewareUser(APP_LOCAL, OLD, newSecurity);

		const parsed = parse(
			fs.readFileSync(middlewaresPath, "utf8"),
		) as FileConfig;
		expect(parsed.http?.middlewares?.["redirect-other"]).toBeDefined();
		const users = readUsers(middlewaresPath);
		expect(users).toHaveLength(1);
		const bobLine = users.find((u) => u.startsWith("bob:"));
		expect(bobLine).toBeDefined();
		expect(await bcrypt.compare("newpass", hashOf(bobLine!))).toBe(true);
	});

	it("attaches the middleware to routers that did not reference it yet", async () => {
		fs.writeFileSync(
			middlewaresPath,
			stringify(initialMiddlewares(["alice:oldhash"])),
			"utf8",
		);
		const appConfigNoMiddleware: FileConfig = {
			http: {
				routers: {
					"myapp-router-1": {
						rule: "Host(`x`)",
						service: "myapp-service",
					},
				},
				services: {
					"myapp-service": {
						loadBalancer: {
							servers: [{ url: "http://myapp:3000" }],
							passHostHeader: true,
						},
					},
				},
			},
		};
		fs.writeFileSync(appConfigPath, stringify(appConfigNoMiddleware), "utf8");

		const newSecurity: Security = {
			...OLD,
			username: "alice",
			password: "newpass",
		};

		await replaceSecurityMiddlewareUser(APP_LOCAL, OLD, newSecurity);

		const appCfg = parse(fs.readFileSync(appConfigPath, "utf8")) as FileConfig;
		expect(appCfg.http?.routers?.["myapp-router-1"]?.middlewares).toContain(
			"auth-myapp",
		);
		const users = readUsers(middlewaresPath);
		expect(users).not.toContain("alice:oldhash");
		expect(await bcrypt.compare("newpass", hashOf(users[0]!))).toBe(true);
	});
});

describe("replaceSecurityMiddlewareUser (remote serverId)", () => {
	const APP_REMOTE = {
		applicationId: "app-1",
		appName: "myapp",
		serverId: "server-1",
	} as unknown as ApplicationNested;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("writes the remote middlewares.yml exactly once with the old user replaced", async () => {
		remoteMocks.execAsyncRemote.mockImplementation(
			async (_serverId, command) => {
				if (command.includes("middlewares.yml")) {
					return {
						stdout: stringify(
							initialMiddlewares(["alice:oldhash", "carol:carolhash"]),
						),
						stderr: "",
					};
				}
				if (command.includes("myapp.yml")) {
					return { stdout: stringify(initialAppConfig()), stderr: "" };
				}
				return { stdout: "", stderr: "" };
			},
		);
		remoteMocks.writeFileRemote.mockResolvedValue(undefined);

		const newSecurity: Security = {
			...OLD,
			username: "bob",
			password: "newpass",
		};

		await replaceSecurityMiddlewareUser(APP_REMOTE, OLD, newSecurity);

		const mwWrites = remoteMocks.writeFileRemote.mock.calls.filter(([, p]) =>
			(p as string).includes("middlewares.yml"),
		);
		expect(mwWrites).toHaveLength(1);

		const [, , content] = mwWrites[0]!;
		const written = parse(content as string) as FileConfig;
		const mw = written.http?.middlewares?.["auth-myapp"] as
			| BasicAuthMW
			| undefined;
		const users = mw?.basicAuth?.users ?? [];
		expect(users).not.toContain("alice:oldhash");
		expect(users).toContain("carol:carolhash");
		const bobLine = users.find((u) => u.startsWith("bob:"));
		expect(bobLine).toBeDefined();
		expect(await bcrypt.compare("newpass", hashOf(bobLine!))).toBe(true);

		const appWrites = remoteMocks.writeFileRemote.mock.calls.filter(([, p]) =>
			(p as string).includes("myapp.yml"),
		);
		expect(appWrites).toHaveLength(1);

		expect(remoteMocks.execAsyncRemote).toHaveBeenCalledTimes(2);
	});
});
