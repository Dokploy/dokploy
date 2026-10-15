import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExportScope,
	Requirement,
} from "@dokploy/server/services/project-export-import";
import { collectFiles } from "@dokploy/server/services/project-export-import";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const local = (path: string) => ({ serverId: null, path });

const { failPullBox } = vi.hoisted(() => ({
	failPullBox: { value: false },
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...actual,
		execAsync: vi.fn(async (command: string, options?: unknown) => {
			if (failPullBox.value && command.includes("tar -czf")) {
				const { ExecError } = await import(
					"@dokploy/server/utils/process/ExecError"
				);
				throw new ExecError(`Command failed: ${command}`, {
					command,
					stderr: "no such file or directory",
					exitCode: 1,
				});
			}
			return actual.execAsync(command, options as undefined);
		}),
	};
});

const baseScope: ExportScope = {
	includeEnvSecrets: true,
	shared: {},
	files: {
		applicationSources: true,
		composeFiles: true,
		traefikRaw: true,
		customCertificates: true,
	},
	dumps: { mode: "none" },
	includeBackupSchedules: true,
};

const emptyServiceArrays = {
	postgres: [],
	mysql: [],
	mariadb: [],
	mongo: [],
	redis: [],
	libsql: [],
};

let root: string;
let workDir: string;

const fakePaths = (_isServer: boolean) => ({
	BASE_PATH: root,
	MAIN_TRAEFIK_PATH: join(root, "traefik"),
	DYNAMIC_TRAEFIK_PATH: join(root, "traefik", "dynamic"),
	LOGS_PATH: join(root, "logs"),
	APPLICATIONS_PATH: join(root, "applications"),
	COMPOSE_PATH: join(root, "compose"),
	SSH_PATH: join(root, "ssh"),
	CERTIFICATES_PATH: join(root, "traefik", "dynamic", "certificates"),
	MONITORING_PATH: join(root, "monitoring"),
	REGISTRY_PATH: join(root, "registry"),
	SCHEDULES_PATH: join(root, "schedules"),
	VOLUME_BACKUPS_PATH: join(root, "volume-backups"),
	VOLUME_BACKUP_LOCK_PATH: join(root, "volume-backup-lock"),
	PATCH_REPOS_PATH: join(root, "patch-repos"),
});

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "transfer-files-root-"));
	workDir = await mkdtemp(join(tmpdir(), "transfer-files-work-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
	await rm(workDir, { recursive: true, force: true });
});

const buildTree = (application: Record<string, unknown>) => ({
	projectId: "project-1",
	name: "my-project",
	organizationId: "org-1",
	env: "",
	environments: [
		{
			environmentId: "env-1",
			name: "production",
			env: "",
			applications: [application],
			compose: [],
			...emptyServiceArrays,
		},
	],
});

describe("collectFiles / application sources", () => {
	it("excludes .git and node_modules for a github-sourced app, and keeps other files", async () => {
		const appDir = join(root, "applications", "app-one");
		await mkdir(join(appDir, ".git"), { recursive: true });
		await writeFile(join(appDir, ".git", "HEAD"), "ref: refs/heads/main");
		await mkdir(join(appDir, "node_modules", "lodash"), { recursive: true });
		await writeFile(join(appDir, "node_modules", "lodash", "index.js"), "x");
		await mkdir(join(appDir, "code"), { recursive: true });
		await writeFile(join(appDir, "code", "main.go"), "package main");
		await writeFile(join(appDir, "Dockerfile"), "FROM node");

		const tree = buildTree({
			applicationId: "app-1",
			appName: "app-one",
			serverId: null,
			sourceType: "github",
			domains: [],
		});

		await collectFiles(tree as any, baseScope, [], local(workDir), {
			pathsFn: fakePaths as any,
		});

		const dest = join(workDir, "files", "applications", "app-one");
		expect(existsSync(join(dest, "Dockerfile"))).toBe(true);
		expect(existsSync(join(dest, ".git"))).toBe(false);
		expect(existsSync(join(dest, "node_modules"))).toBe(false);
		expect(existsSync(join(dest, "code"))).toBe(false);
	});

	it("keeps code/ for a drop-sourced app (no repo to re-clone from)", async () => {
		const appDir = join(root, "applications", "app-drop");
		await mkdir(join(appDir, "code"), { recursive: true });
		await writeFile(join(appDir, "code", "main.go"), "package main");

		const tree = buildTree({
			applicationId: "app-drop",
			appName: "app-drop",
			serverId: null,
			sourceType: "drop",
			domains: [],
		});

		await collectFiles(tree as any, baseScope, [], local(workDir), {
			pathsFn: fakePaths as any,
		});

		const dest = join(workDir, "files", "applications", "app-drop");
		expect(existsSync(join(dest, "code", "main.go"))).toBe(true);
	});

	it("does nothing when applicationSources is excluded from scope", async () => {
		const appDir = join(root, "applications", "app-one");
		await mkdir(appDir, { recursive: true });
		await writeFile(join(appDir, "Dockerfile"), "FROM node");

		const tree = buildTree({
			applicationId: "app-1",
			appName: "app-one",
			serverId: null,
			sourceType: "github",
			domains: [],
		});

		await collectFiles(
			tree as any,
			{
				...baseScope,
				files: { ...baseScope.files, applicationSources: false },
			},
			[],
			local(workDir),
			{ pathsFn: fakePaths as any },
		);

		expect(existsSync(join(workDir, "files", "applications", "app-one"))).toBe(
			false,
		);
	});

	it("does not throw when the application source directory doesn't exist (e.g. docker image source)", async () => {
		const tree = buildTree({
			applicationId: "app-1",
			appName: "does-not-exist",
			serverId: null,
			sourceType: "docker",
			domains: [],
		});

		await expect(
			collectFiles(tree as any, baseScope, [], local(workDir), {
				pathsFn: fakePaths as any,
			}),
		).resolves.toEqual({ warnings: [] });
	});
});

describe("collectFiles / traefik raw", () => {
	it("collects only the application's own dynamic yml file", async () => {
		await mkdir(join(root, "applications", "app-one"), { recursive: true });
		await mkdir(join(root, "traefik", "dynamic"), { recursive: true });
		await writeFile(
			join(root, "traefik", "dynamic", "app-one.yml"),
			"http:\n  routers: {}",
		);
		await writeFile(
			join(root, "traefik", "dynamic", "app-two.yml"),
			"http:\n  routers: unrelated",
		);

		const tree = buildTree({
			applicationId: "app-1",
			appName: "app-one",
			serverId: null,
			sourceType: "docker",
			domains: [],
		});

		await collectFiles(
			tree as any,
			{
				...baseScope,
				files: {
					applicationSources: false,
					composeFiles: false,
					traefikRaw: true,
					customCertificates: false,
				},
			},
			[],
			local(workDir),
			{ pathsFn: fakePaths as any },
		);

		const collected = join(workDir, "files", "traefik", "app-one.yml");
		expect(existsSync(collected)).toBe(true);
		expect(readFileSync(collected, "utf8")).toBe("http:\n  routers: {}");
		expect(existsSync(join(workDir, "files", "traefik", "app-two.yml"))).toBe(
			false,
		);
	});

	it("leaves no traefik directory behind when the app has no dynamic yml", async () => {
		const tree = buildTree({
			applicationId: "app-1",
			appName: "app-one",
			serverId: null,
			sourceType: "docker",
			domains: [],
		});

		await collectFiles(
			tree as any,
			{
				...baseScope,
				files: {
					applicationSources: false,
					composeFiles: false,
					traefikRaw: true,
					customCertificates: false,
				},
			},
			[],
			local(workDir),
			{ pathsFn: fakePaths as any },
		);

		expect(existsSync(join(workDir, "files"))).toBe(false);
	});
});

describe("collectFiles / custom certificates (T-6.18)", () => {
	const emptyTree = buildTree({
		applicationId: "app-1",
		appName: "app-one",
		serverId: null,
		sourceType: "docker",
		domains: [],
	});

	it("pulls a local certificate (serverId: null) from CERTIFICATES_PATH on the local host", async () => {
		const certDir = join(root, "traefik", "dynamic", "certificates", "cert-1");
		await mkdir(certDir, { recursive: true });
		await writeFile(join(certDir, "cert.pem"), "local cert contents");

		const certRequirement: Requirement = {
			kind: "certificate",
			originalId: "cert-1",
			configIncluded: false,
			usedBy: [],
			fingerprint: "abc123",
			serverId: null,
		};

		await collectFiles(
			emptyTree as any,
			{
				...baseScope,
				files: {
					applicationSources: false,
					composeFiles: false,
					traefikRaw: false,
					customCertificates: true,
				},
			},
			[certRequirement],
			local(workDir),
			{ pathsFn: fakePaths as any },
		);

		const collected = join(
			workDir,
			"files",
			"certificates",
			"cert-1",
			"cert.pem",
		);
		expect(existsSync(collected)).toBe(true);
		expect(readFileSync(collected, "utf8")).toBe("local cert contents");
	});

	it("uses the certificate's own serverId (not local) when it's hosted on a remote server", async () => {
		const certRequirement: Requirement = {
			kind: "certificate",
			originalId: "cert-2",
			configIncluded: false,
			usedBy: [],
			fingerprint: "def456",
			serverId: "server-1",
		};

		const messages: string[] = [];
		await collectFiles(
			emptyTree as any,
			{
				...baseScope,
				files: {
					applicationSources: false,
					composeFiles: false,
					traefikRaw: false,
					customCertificates: true,
				},
			},
			[certRequirement],
			local(workDir),
			{ pathsFn: fakePaths as any, emit: (message) => messages.push(message) },
		);

		expect(messages.some((m) => m.includes("server server-1"))).toBe(true);
		expect(
			existsSync(join(workDir, "files", "certificates", "cert-2", "cert.pem")),
		).toBe(false);
	});
});

describe("collectFiles / skip messages are redacted (T-10.9)", () => {
	afterEach(() => {
		failPullBox.value = false;
	});

	it("reports the exit code and stderr, not the raw command, when a local pull fails", async () => {
		const appDir = join(root, "applications", "app-one");
		await mkdir(appDir, { recursive: true });
		await writeFile(join(appDir, "Dockerfile"), "FROM node");

		failPullBox.value = true;

		const tree = buildTree({
			applicationId: "app-1",
			appName: "app-one",
			serverId: null,
			sourceType: "docker",
			domains: [],
		});

		const messages: string[] = [];
		const { warnings } = await collectFiles(
			tree as any,
			{
				...baseScope,
				files: {
					applicationSources: true,
					composeFiles: false,
					traefikRaw: false,
					customCertificates: false,
				},
			},
			[],
			local(workDir),
			{ pathsFn: fakePaths as any, emit: (message) => messages.push(message) },
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain("exit code 1");
		expect(messages[0]).toContain("no such file or directory");
		expect(messages[0]).not.toContain("tar -czf");
		expect(existsSync(join(workDir, "files"))).toBe(false);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.code).toBe("FILE_PULL_FAILED");
		expect(warnings[0]?.message).toBe(messages[0]);
		expect(warnings[0]?.affected).toContainEqual(
			expect.objectContaining({ serviceId: "app-1" }),
		);
	});
});
