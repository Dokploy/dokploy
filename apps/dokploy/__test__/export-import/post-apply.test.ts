import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	Plan,
	Snapshot,
	TransferDb,
	TransferResult,
} from "@dokploy/server/services/project-export-import";
import { postApply } from "@dokploy/server/services/project-export-import";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const local = (path: string) => ({ serverId: null, path });

vi.mock("@dokploy/server/services/mount", () => ({
	createFileMount: vi.fn(async () => {}),
}));

const { createFileMount } = await import("@dokploy/server/services/mount");

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
	root = await mkdtemp(join(tmpdir(), "transfer-postapply-root-"));
	workDir = await mkdtemp(join(tmpdir(), "transfer-postapply-work-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
	await rm(workDir, { recursive: true, force: true });
});

const composeService = {
	kind: "compose",
	composeId: "compose-1",
	appName: "my-compose-abc123",
	environmentId: "env-1",
	serverId: null,
};

const snapshot: Snapshot = {
	manifest: {
		format: "dokploy-project-export",
		formatVersion: 1,
		exportedAt: "2024-01-01T00:00:00.000Z",
		exportedBy: { userId: "user-1", email: "a@b.com" },
		sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
		scope: {
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
		},
		crypto: {
			salt: "c2FsdA==",
			kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
			keyCheck: "{}",
		},
		counts: {},
	},
	resources: {
		project: {},
		environments: [],
		services: [composeService],
		shared: {},
	},
	requirements: [],
	warnings: [],
	dumps: [],
};

const plan: Plan = {
	target: { kind: "newProject", name: "imported" },
	resolutions: {},
	serverMap: {},
	appNameMap: { "my-compose-abc123": "my-compose-xyz789" },
	domainStrategy: { custom: "keep" },
	portsStrategy: "keep",
	rotateDatabaseCredentials: false,
	conflicts: [],
	pendingServices: [],
	warnings: [],
	validation: [],
	summary: { counts: {}, domains: 0, dumps: 0 },
};

const result: TransferResult = {
	idMap: { compose: { "compose-1": "compose-new-1" } },
	appNameMap: plan.appNameMap,
	pendingRequirements: [],
	pendingServices: [],
	rotations: [],
	restoreErrors: [],
	warnings: [],
};

const fakeDb = {
	query: {
		certificates: { findFirst: async () => undefined },
		mounts: { findMany: async () => [] },
	},
} as any as TransferDb;

describe("postApply", () => {
	it("copies compose files to the new appName, rewriting docker-compose.yml, and reports it as a deploy candidate", async () => {
		const sourceDir = join(workDir, "files", "compose", "my-compose-abc123");
		await mkdir(sourceDir, { recursive: true });
		await writeFile(
			join(sourceDir, "docker-compose.yml"),
			"services:\n  web:\n    container_name: my-compose-abc123-web\n",
		);
		await writeFile(join(sourceDir, ".env"), "APP_NAME=my-compose-abc123\n");

		const { deployCandidates } = await postApply(
			fakeDb,
			snapshot,
			plan,
			result,
			local(workDir),
			{
				pathsFn: fakePaths as any,
			},
		);

		const destDir = join(root, "compose", "my-compose-xyz789");
		expect(existsSync(join(destDir, "docker-compose.yml"))).toBe(true);
		const composeContent = await readFile(
			join(destDir, "docker-compose.yml"),
			"utf8",
		);
		expect(composeContent).toContain("my-compose-xyz789-web");
		expect(composeContent).not.toContain("my-compose-abc123");

		const envContent = await readFile(join(destDir, ".env"), "utf8");
		expect(envContent).toContain("APP_NAME=my-compose-xyz789");

		expect(deployCandidates).toEqual([
			{ serviceId: "compose-new-1", serviceType: "compose", serverId: null },
		]);
	});

	it("excludes pending services from deployCandidates", async () => {
		const pendingPlan: Plan = {
			...plan,
			pendingServices: [
				{
					serviceId: "compose-1",
					serviceType: "compose",
					reason: "Missing registry",
				},
			],
		};

		const { deployCandidates } = await postApply(
			fakeDb,
			snapshot,
			pendingPlan,
			result,
			local(workDir),
			{ pathsFn: fakePaths as any },
		);

		expect(deployCandidates).toEqual([]);
	});
});

describe("postApply writes file-type mounts to disk (T-6.6)", () => {
	it("calls createFileMount for every file-type mount belonging to a newly created service", async () => {
		(createFileMount as any).mockClear();
		const dbWithMounts = {
			query: {
				certificates: { findFirst: async () => undefined },
				mounts: {
					findMany: async () => [
						{
							mountId: "mount-file-1",
							type: "file",
							filePath: "/app/nginx.conf",
						},
					],
				},
			},
		} as any as TransferDb;

		await postApply(dbWithMounts, snapshot, plan, result, local(workDir), {
			pathsFn: fakePaths as any,
		});

		expect(createFileMount).toHaveBeenCalledWith("mount-file-1");
		expect(createFileMount).toHaveBeenCalledTimes(1);
	});
});

describe("postApply rejects an unsafe appName (T-9.2)", () => {
	it("reports a postApplyError instead of joining a path-traversal appName into a local path", async () => {
		const maliciousSnapshot: Snapshot = {
			...snapshot,
			resources: {
				...snapshot.resources,
				services: [
					{
						...composeService,
						appName: "../../../etc",
					},
				],
			},
		};
		const maliciousPlan: Plan = { ...plan, appNameMap: {} };

		const { deployCandidates, postApplyErrors } = await postApply(
			fakeDb,
			maliciousSnapshot,
			maliciousPlan,
			result,
			local(workDir),
			{ pathsFn: fakePaths as any },
		);

		expect(deployCandidates).toEqual([]);
		expect(postApplyErrors).toHaveLength(1);
		expect(postApplyErrors[0]?.error).toContain("Unsafe path in bundle");
	});
});
