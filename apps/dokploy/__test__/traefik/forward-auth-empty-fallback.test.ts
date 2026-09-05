import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested, Domain } from "@dokploy/server";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import { createForwardAuthMiddleware } from "@dokploy/server/utils/traefik/forward-auth";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parse, stringify } from "yaml";

const execMocks = vi.hoisted(() => ({
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
		execAsyncRemote: execMocks.execAsyncRemote,
		writeFileRemote: execMocks.writeFileRemote,
	};
});

const dbMocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			forwardAuthSettings: { findFirst: dbMocks.findFirst },
		},
	},
}));

const forwardAuthDomain: Domain = {
	applicationId: "app-1",
	certificateType: "none",
	createdAt: "",
	domainId: "domain-1",
	host: "app-b.example.com",
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
	forwardAuthEnabled: true,
	enabled: true,
};

const makeApp = (appName: string, serverId: string | null) =>
	({
		appName,
		serverId,
		redirects: [],
		security: [],
	}) as unknown as ApplicationNested;

const existingMiddlewaresYaml = stringify({
	http: {
		middlewares: {
			"auth-app-a-1": { basicAuth: { users: ["u:hash"] } },
			"redirect-to-https": {
				redirectScheme: { scheme: "https", permanent: true },
			},
		},
	},
});

const sshError = () =>
	new ExecError("SSH connection error: Connection timed out", {
		command: "cat /etc/dokploy/traefik/dynamic/middlewares.yml",
		serverId: "server-1",
		originalError: new Error("Connection timed out"),
	});

const parseWritten = () => {
	expect(execMocks.writeFileRemote).toHaveBeenCalledOnce();
	const [, , yaml] = execMocks.writeFileRemote.mock.calls[0] ?? [];
	return parse(yaml as string) as {
		http?: { middlewares?: Record<string, unknown> };
	};
};

describe("createForwardAuthMiddleware — remote load error handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		execMocks.writeFileRemote.mockResolvedValue(undefined);
		dbMocks.findFirst.mockResolvedValue({
			authDomain: "auth.example.com",
			https: true,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("aborts and does not overwrite middlewares.yml when the SSH load fails", async () => {
		execMocks.execAsyncRemote.mockRejectedValue(sshError());

		await expect(
			createForwardAuthMiddleware(
				makeApp("app-b", "server-1"),
				forwardAuthDomain,
			),
		).rejects.toThrow(/SSH connection error/);

		// The shared middlewares.yml must NOT be overwritten with an empty +
		// app-b-only config; existing entries on the server are preserved.
		expect(execMocks.writeFileRemote).not.toHaveBeenCalled();
		expect(execMocks.execAsyncRemote).toHaveBeenCalledOnce();
	});

	test("propagates the original ExecError instead of a masked 'File not found'", async () => {
		execMocks.execAsyncRemote.mockRejectedValue(sshError());

		await expect(
			createForwardAuthMiddleware(
				makeApp("app-b", "server-1"),
				forwardAuthDomain,
			),
		).rejects.toBeInstanceOf(ExecError);
	});

	test("preserves other apps' middlewares and redirect-to-https on successful load", async () => {
		execMocks.execAsyncRemote.mockResolvedValue({
			stdout: existingMiddlewaresYaml,
			stderr: "",
		});

		await createForwardAuthMiddleware(
			makeApp("app-b", "server-1"),
			forwardAuthDomain,
		);

		const written = parseWritten();
		const keys = Object.keys(written.http?.middlewares ?? {});

		// app-b's forward-auth middlewares are added
		expect(keys).toContain("forward-auth-app-b-7");
		expect(keys).toContain("forward-auth-app-b-7-errors");
		// app-a's existing auth middleware is preserved (regression guard)
		expect(keys).toContain("auth-app-a-1");
		// the built-in server-wide middleware is preserved
		expect(keys).toContain("redirect-to-https");
	});

	test("no-ops when forwardAuthEnabled is false", async () => {
		await createForwardAuthMiddleware(makeApp("app-b", "server-1"), {
			...forwardAuthDomain,
			forwardAuthEnabled: false,
		});

		expect(dbMocks.findFirst).not.toHaveBeenCalled();
		expect(execMocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(execMocks.writeFileRemote).not.toHaveBeenCalled();
	});

	test("no-ops when no auth gate is configured for the server", async () => {
		dbMocks.findFirst.mockResolvedValue(undefined);

		await createForwardAuthMiddleware(
			makeApp("app-b", "server-1"),
			forwardAuthDomain,
		);

		expect(dbMocks.findFirst).toHaveBeenCalledOnce();
		expect(execMocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(execMocks.writeFileRemote).not.toHaveBeenCalled();
	});
});

describe("createForwardAuthMiddleware — local load error handling", () => {
	let cwd: string;
	let dynamicPath: string;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-fa-"));
		dynamicPath = path.join(cwd, ".docker", "traefik", "dynamic");
		fs.mkdirSync(dynamicPath, { recursive: true });
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		vi.clearAllMocks();
		dbMocks.findFirst.mockResolvedValue({
			authDomain: "auth.example.com",
			https: true,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	test("aborts and leaves the filesystem untouched when the local file is missing", async () => {
		// No middlewares.yml present → loadMiddlewares throws "File not found".
		await expect(
			createForwardAuthMiddleware(makeApp("app-b", null), forwardAuthDomain),
		).rejects.toThrow(/File not found/);

		// No destructive empty write happened: the file is still absent.
		expect(fs.existsSync(path.join(dynamicPath, "middlewares.yml"))).toBe(
			false,
		);
	});

	test("preserves existing middlewares on successful local load", async () => {
		const configPath = path.join(dynamicPath, "middlewares.yml");
		fs.writeFileSync(configPath, existingMiddlewaresYaml, "utf8");

		await createForwardAuthMiddleware(
			makeApp("app-b", null),
			forwardAuthDomain,
		);

		const written = parse(fs.readFileSync(configPath, "utf8")) as {
			http?: { middlewares?: Record<string, unknown> };
		};
		const keys = Object.keys(written.http?.middlewares ?? {});

		expect(keys).toContain("forward-auth-app-b-7");
		expect(keys).toContain("forward-auth-app-b-7-errors");
		expect(keys).toContain("auth-app-a-1");
		expect(keys).toContain("redirect-to-https");
	});
});
