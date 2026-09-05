import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApplicationNested, Domain } from "@dokploy/server";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import { createPathMiddlewares } from "@dokploy/server/utils/traefik/middleware";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parse, stringify } from "yaml";

const mocks = vi.hoisted(() => ({
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
		execAsyncRemote: mocks.execAsyncRemote,
		writeFileRemote: mocks.writeFileRemote,
	};
});

// A domain with path-rewriting configured so createPathMiddlewares actually
// enters its load → mutate → overwrite body (it early-returns otherwise).
const pathRewritingDomain: Domain = {
	applicationId: "app-1",
	certificateType: "none",
	createdAt: "",
	domainId: "domain-1",
	host: "app-b.example.com",
	https: false,
	path: "/public",
	port: 3000,
	customEntrypoint: null,
	serviceName: "",
	composeId: "",
	customCertResolver: null,
	domainType: "application",
	uniqueConfigKey: 9,
	previewDeploymentId: "",
	internalPath: "/app/v2",
	stripPath: true,
	middlewares: null,
	forwardAuthEnabled: false,
	enabled: true,
};

const makeApp = (appName: string, serverId: string | null) =>
	({
		appName,
		serverId,
		redirects: [],
		security: [],
	}) as unknown as ApplicationNested;

// Pre-existing shared middlewares.yml contents from an already-deployed app A
// plus the built-in server-wide redirect-to-https middleware.
const existingMiddlewaresYaml = stringify({
	http: {
		middlewares: {
			"auth-app-a-1": { basicAuth: { users: ["u:hash"] } },
			"redirect-app-a-1": {
				redirectRegex: {
					regex: "^/$",
					replacement: "/new",
					permanent: false,
				},
			},
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
	expect(mocks.writeFileRemote).toHaveBeenCalledOnce();
	const [, , yaml] = mocks.writeFileRemote.mock.calls[0] ?? [];
	return parse(yaml as string) as {
		http?: { middlewares?: Record<string, unknown> };
	};
};

describe("createPathMiddlewares — remote load error handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.writeFileRemote.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("aborts and does not overwrite middlewares.yml when the SSH load fails", async () => {
		mocks.execAsyncRemote.mockRejectedValue(sshError());

		await expect(
			createPathMiddlewares(makeApp("app-b", "server-1"), pathRewritingDomain),
		).rejects.toThrow(/SSH connection error/);

		// The shared middlewares.yml must NOT be overwritten with an empty +
		// app-b-only config; the existing entries on the server are preserved.
		expect(mocks.writeFileRemote).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledOnce();
	});

	test("does not mask transport errors as a benign 'File not found'", async () => {
		// The original ExecError must propagate so callers see the real cause
		// (SSH/parse failure) rather than a misleading "File not found".
		mocks.execAsyncRemote.mockRejectedValue(sshError());

		await expect(
			createPathMiddlewares(makeApp("app-b", "server-1"), pathRewritingDomain),
		).rejects.toBeInstanceOf(ExecError);
	});

	test("preserves other apps' middlewares and redirect-to-https on successful load", async () => {
		mocks.execAsyncRemote.mockResolvedValue({
			stdout: existingMiddlewaresYaml,
			stderr: "",
		});

		await createPathMiddlewares(
			makeApp("app-b", "server-1"),
			pathRewritingDomain,
		);

		const written = parseWritten();
		const keys = Object.keys(written.http?.middlewares ?? {});

		// app-b's new path middlewares are added
		expect(keys).toContain("addprefix-app-b-9");
		expect(keys).toContain("stripprefix-app-b-9");
		// app-a's existing middlewares are preserved (regression guard)
		expect(keys).toContain("auth-app-a-1");
		expect(keys).toContain("redirect-app-a-1");
		// the built-in server-wide middleware is preserved
		expect(keys).toContain("redirect-to-https");
	});

	test("early-returns without loading when the domain has no path rewriting", async () => {
		await createPathMiddlewares(makeApp("app-b", "server-1"), {
			...pathRewritingDomain,
			internalPath: "/",
			stripPath: false,
			path: null,
		});

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.writeFileRemote).not.toHaveBeenCalled();
	});
});

describe("createPathMiddlewares — local load error handling", () => {
	let cwd: string;
	let dynamicPath: string;

	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "dokploy-mw-"));
		dynamicPath = path.join(cwd, ".docker", "traefik", "dynamic");
		fs.mkdirSync(dynamicPath, { recursive: true });
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	test("aborts and leaves the filesystem untouched when the local file is missing", async () => {
		// No middlewares.yml present → loadMiddlewares throws "File not found".
		await expect(
			createPathMiddlewares(makeApp("app-b", null), pathRewritingDomain),
		).rejects.toThrow(/File not found/);

		// No destructive empty write happened: the file is still absent.
		expect(fs.existsSync(path.join(dynamicPath, "middlewares.yml"))).toBe(
			false,
		);
	});

	test("preserves existing middlewares on successful local load", async () => {
		const configPath = path.join(dynamicPath, "middlewares.yml");
		fs.writeFileSync(configPath, existingMiddlewaresYaml, "utf8");

		await createPathMiddlewares(makeApp("app-b", null), pathRewritingDomain);

		const written = parse(fs.readFileSync(configPath, "utf8")) as {
			http?: { middlewares?: Record<string, unknown> };
		};
		const keys = Object.keys(written.http?.middlewares ?? {});

		expect(keys).toContain("addprefix-app-b-9");
		expect(keys).toContain("stripprefix-app-b-9");
		expect(keys).toContain("auth-app-a-1");
		expect(keys).toContain("redirect-app-a-1");
		expect(keys).toContain("redirect-to-https");
	});
});
