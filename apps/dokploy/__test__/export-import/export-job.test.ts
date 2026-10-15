import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExportScope,
	TransferDb,
} from "@dokploy/server/services/project-export-import";
import {
	cancelExport,
	cleanupExpiredExports,
	createExportJob,
	getExportJob,
	runExport,
	runExportBatch,
} from "@dokploy/server/services/project-export-import";
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "transfer-export-job-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

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
	PROJECT_EXPORT_IMPORT_PATH: join(root, "transfer"),
});

const emptyProjectTree = {
	projectId: "project-1",
	name: "my-project",
	organizationId: "org-1",
	env: "",
	environments: [],
};

const fakeDb = (): TransferDb =>
	({
		query: {
			projects: { findFirst: async () => emptyProjectTree },
			environments: { findFirst: async () => undefined },
			schedules: { findMany: async () => [] },
			volumeBackups: { findMany: async () => [] },
		},
	}) as any as TransferDb;

const baseScope: ExportScope = {
	includeEnvSecrets: true,
	shared: {},
	files: {
		applicationSources: true,
		composeFiles: true,
		traefikRaw: true,
		customCertificates: true,
	},
	dumps: { mode: "embed" },
	includeBackupSchedules: true,
};

const waitForStatus = async (
	exportId: string,
	target: "done" | "error",
	timeoutMs = 5000,
) => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const job = getExportJob(exportId);
		if (job?.status === target || job?.status === "error") {
			return job;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(
		`Timed out waiting for export ${exportId} to reach ${target}`,
	);
};

describe("runExport", () => {
	it("produces a downloadable bundle for an (empty) project and issues a download token", async () => {
		const { exportId } = runExport(
			{
				source: { kind: "project", id: "project-1" },
				scope: baseScope,
				passphrase: "correct-horse-battery-staple",
			},
			{
				db: fakeDb(),
				userId: "user-1",
				userEmail: "a@b.com",
				organizationId: "org-1",
				dokployVersion: "1.0.0-test",
				pathsFn: fakePaths as any,
			},
		);

		const job = await waitForStatus(exportId, "done");
		expect(job?.status).toBe("done");
		expect(job?.bundle?.path).toBeDefined();
		expect(existsSync(job?.bundle?.path as string)).toBe(true);
		expect(job?.downloadToken).toBeDefined();
		expect(job?.size).toBeGreaterThan(0);
	});

	it("attaches dump warnings to the finished job when an embedded dump fails", async () => {
		const tree = {
			...emptyProjectTree,
			environments: [
				{
					environmentId: "env-1",
					name: "production",
					env: "",
					applications: [],
					compose: [],
					postgres: [
						{
							postgresId: "pg-1",
							name: "pg",
							appName: "pg-one",
							databaseName: "db",
							databaseUser: "u",
							databasePassword: "p",
							serverId: null,
							backups: [],
							mounts: [],
						},
					],
					mysql: [],
					mariadb: [],
					mongo: [],
					redis: [],
					libsql: [],
				},
			],
		};
		const db = {
			query: {
				projects: { findFirst: async () => tree },
				environments: { findFirst: async () => undefined },
				schedules: { findMany: async () => [] },
				volumeBackups: { findMany: async () => [] },
				applications: {
					findMany: async () => [],
					findFirst: async () => undefined,
				},
			},
		} as any as TransferDb;

		const { exportId } = runExport(
			{
				source: { kind: "project", id: "project-1" },
				scope: baseScope,
				passphrase: "correct-horse-battery-staple",
			},
			{
				db,
				userId: "user-1",
				userEmail: "a@b.com",
				organizationId: "org-1",
				dokployVersion: "1.0.0-test",
				pathsFn: fakePaths as any,
			},
		);

		const job = await waitForStatus(exportId, "done");
		expect(job?.status).toBe("done");
		expect(job?.warnings?.map((warning) => warning.code)).toEqual([
			"DUMP_FAILED",
		]);
		expect(job?.message).toMatch(/^Export complete with 1 warning\(s\)/);
	});

	it("gives two concurrent exports independent exportIds and workDirs", async () => {
		const first = runExport(
			{
				source: { kind: "project", id: "project-1" },
				scope: baseScope,
				passphrase: "correct-horse-battery-staple",
			},
			{
				db: fakeDb(),
				userId: "user-1",
				userEmail: "a@b.com",
				organizationId: "org-1",
				dokployVersion: "1.0.0-test",
				pathsFn: fakePaths as any,
			},
		);
		const second = runExport(
			{
				source: { kind: "project", id: "project-1" },
				scope: baseScope,
				passphrase: "correct-horse-battery-staple",
			},
			{
				db: fakeDb(),
				userId: "user-1",
				userEmail: "a@b.com",
				organizationId: "org-1",
				dokployVersion: "1.0.0-test",
				pathsFn: fakePaths as any,
			},
		);

		expect(first.exportId).not.toBe(second.exportId);

		const [job1, job2] = await Promise.all([
			waitForStatus(first.exportId, "done"),
			waitForStatus(second.exportId, "done"),
		]);
		expect(job1?.bundle?.path).not.toBe(job2?.bundle?.path);
		expect(existsSync(job1?.bundle?.path as string)).toBe(true);
		expect(existsSync(job2?.bundle?.path as string)).toBe(true);
	});
});

describe("runExportBatch", () => {
	it("runs the exports one after another and finishes every job", async () => {
		const ctx = {
			db: fakeDb(),
			userId: "user-1",
			userEmail: "a@b.com",
			organizationId: "org-1",
			dokployVersion: "1.0.0-test",
			pathsFn: fakePaths as any,
		};
		const input = {
			source: { kind: "project" as const, id: "project-1" },
			scope: baseScope,
			passphrase: "correct-horse-battery-staple",
		};
		const { exportIds } = runExportBatch([input, input], ctx);
		expect(exportIds).toHaveLength(2);

		const first = await waitForStatus(exportIds[0] as string, "done");
		const second = await waitForStatus(exportIds[1] as string, "done");
		expect(first?.bundle?.path).not.toBe(second?.bundle?.path);
		expect(existsSync(first?.bundle?.path as string)).toBe(true);
		expect(existsSync(second?.bundle?.path as string)).toBe(true);
	}, 30_000);

	it("restarts each job's TTL when it finishes, not when the batch was queued", async () => {
		const input = {
			source: { kind: "project" as const, id: "project-1" },
			scope: baseScope,
			passphrase: "correct-horse-battery-staple",
		};
		const { exportIds } = runExportBatch([input, input], {
			db: fakeDb(),
			userId: "user-1",
			userEmail: "a@b.com",
			organizationId: "org-1",
			dokployVersion: "1.0.0-test",
			pathsFn: fakePaths as any,
		});
		const queuedAt = getExportJob(exportIds[1] as string)?.createdAt as number;

		const first = await waitForStatus(exportIds[0] as string, "done");
		const second = await waitForStatus(exportIds[1] as string, "done");
		expect(second?.createdAt).toBeGreaterThan(queuedAt);
		expect(second?.createdAt).toBeGreaterThanOrEqual(
			first?.createdAt as number,
		);
	}, 30_000);
});

describe("cancelExport (T-6.7)", () => {
	it("refuses to cancel while the export is actually running", async () => {
		const job = createExportJob("cancel-running-1", "user-1", "org-1");
		job.status = "dumping";

		await expect(cancelExport("cancel-running-1")).rejects.toThrow(TRPCError);
		expect(getExportJob("cancel-running-1")?.status).toBe("dumping");
	});

	it("allows cancelling once the export has reached a terminal status", async () => {
		const job = createExportJob("cancel-done-1", "user-1", "org-1");
		job.status = "done";

		await cancelExport("cancel-done-1");
		expect(getExportJob("cancel-done-1")).toBeUndefined();
	});
});

describe("cleanupExpiredExports", () => {
	it("deletes expired jobs and their bundle files", async () => {
		const job = createExportJob("expired-1", "user-1", "org-1");
		const bundlePath = join(root, "expired-1.dokploy.tar.gz");
		await writeFile(bundlePath, "fake bundle");
		job.workspace = { serverId: null, path: join(root, "expired-1") };
		job.bundle = { serverId: null, path: bundlePath };
		job.status = "done";

		const farFuture = Date.now() + 2 * 60 * 60 * 1000;
		const expired = await cleanupExpiredExports(farFuture);

		expect(expired.map((j) => j.exportId)).toContain("expired-1");
		expect(getExportJob("expired-1")).toBeUndefined();
		expect(existsSync(bundlePath)).toBe(false);
	});

	it("leaves fresh jobs untouched", async () => {
		createExportJob("fresh-1", "user-1", "org-1");
		const expired = await cleanupExpiredExports(Date.now());
		expect(expired.map((j) => j.exportId)).not.toContain("fresh-1");
		expect(getExportJob("fresh-1")).toBeDefined();
	});

	it("leaves an active (non-terminal status) job alone even past the TTL", async () => {
		const job = createExportJob("active-past-ttl-1", "user-1", "org-1");
		job.status = "dumping";

		const farFuture = Date.now() + 2 * 60 * 60 * 1000;
		const expired = await cleanupExpiredExports(farFuture);

		expect(expired.map((j) => j.exportId)).not.toContain("active-past-ttl-1");
		expect(getExportJob("active-past-ttl-1")).toBeDefined();
	});

	it("does clean up a terminal-status job once it's past the TTL", async () => {
		const job = createExportJob("terminal-past-ttl-1", "user-1", "org-1");
		job.status = "error";

		const farFuture = Date.now() + 2 * 60 * 60 * 1000;
		const expired = await cleanupExpiredExports(farFuture);

		expect(expired.map((j) => j.exportId)).toContain("terminal-past-ttl-1");
		expect(getExportJob("terminal-past-ttl-1")).toBeUndefined();
	});
});
