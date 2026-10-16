import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	Plan,
	Snapshot,
	TransferWriteDb,
} from "@dokploy/server/services/project-export-import";
import {
	cancelImport,
	cleanupExpiredImports,
	createImportJob,
	getImportJob,
	runImport,
	updateImportJob,
} from "@dokploy/server/services/project-export-import";
import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it } from "vitest";

const local = (path: string) => ({ serverId: null, path });

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
				applicationSources: false,
				composeFiles: false,
				traefikRaw: false,
				customCertificates: false,
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
		project: { projectId: "project-1", name: "my-project" },
		environments: [],
		services: [],
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
	appNameMap: {},
	domainStrategy: { custom: "keep" },
	portsStrategy: "keep",
	rotateDatabaseCredentials: false,
	conflicts: [],
	pendingServices: [],
	warnings: [],
	validation: [],
	summary: { counts: {}, domains: 0, dumps: 0 },
};

const waitForStatus = async (
	importId: string,
	target: "done" | "failed",
	timeoutMs = 5000,
) => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const job = getImportJob(importId);
		if (job?.status === target || job?.status === "failed") {
			return job;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(
		`Timed out waiting for import ${importId} to reach ${target}`,
	);
};

describe("runImport", () => {
	it("leaves nothing created when apply() fails (transaction never commits)", async () => {
		const importId = "import-fail-1";
		createImportJob(importId, "user-1", "org-dest");
		updateImportJob(importId, {
			snapshot,
			plan,
			secretsPlain: new Map(),
			workDir: local("/tmp/does-not-matter"),
		});

		const failingDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
			},
			insert: () => {
				throw new Error("insert should never be called");
			},
			update: () => {
				throw new Error("update should never be called");
			},
			transaction: async () => {
				throw new Error("Simulated apply failure");
			},
		} as any as TransferWriteDb;

		runImport(importId, { db: failingDb, organizationId: "org-dest" });

		const job = await waitForStatus(importId, "failed");
		expect(job?.status).toBe("failed");
		expect(job?.result).toBeUndefined();
		expect(job?.partial).toBeFalsy();
		expect(job?.error).toContain("Simulated apply failure");
	});

	it("clears secretsPlain right after apply() and snapshot once the job is done", async () => {
		const importId = "import-clear-secrets-1";
		createImportJob(importId, "user-1", "org-dest");
		updateImportJob(importId, {
			snapshot,
			plan,
			secretsPlain: new Map([["some-secret-id", "super-secret-value"]]),
			workDir: local("/tmp/does-not-matter"),
		});

		const workingDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				certificates: { findFirst: async () => undefined },
			},
			insert: () => ({
				values: (values: Record<string, unknown>) => ({
					returning: async () => [{ ...values, projectId: "new-project-1" }],
				}),
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...workingDb }),
		} as any as TransferWriteDb;

		runImport(importId, { db: workingDb, organizationId: "org-dest" });

		const job = await waitForStatus(importId, "done");
		expect(job?.status).toBe("done");
		expect(job?.secretsPlain).toBeUndefined();
		expect(job?.snapshot).toBeUndefined();
	});

	it("refuses to run without snapshot/plan/secrets already set on the job", async () => {
		const importId = "import-missing-1";
		createImportJob(importId, "user-1", "org-dest");

		const unusedDb = {
			query: {},
			insert: () => {
				throw new Error("should never be called");
			},
			update: () => {
				throw new Error("should never be called");
			},
			transaction: async () => {
				throw new Error("should never be called");
			},
		} as any as TransferWriteDb;

		runImport(importId, { db: unusedDb, organizationId: "org-dest" });

		const job = await waitForStatus(importId, "failed");
		expect(job?.status).toBe("failed");
		expect(job?.error).toMatch(/inspect, unlock and plan/i);
	});
});

describe("cancelImport (T-4.2)", () => {
	let root: string;

	afterEach(async () => {
		if (root) {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("removes the whole per-job directory, not just job.workDir; including the uploaded bundle sitting next to it", async () => {
		root = await mkdtemp(join(tmpdir(), "transfer-cancel-import-"));
		const importId = "import-cancel-1";
		const jobDir = join(root, importId);
		const workDir = join(jobDir, "extracted");
		await mkdir(workDir, { recursive: true });
		await writeFile(join(jobDir, "bundle.dokploy.tar.gz"), "fake bundle");
		await writeFile(join(workDir, "manifest.json"), "{}");

		createImportJob(importId, "user-1", "org-dest");
		updateImportJob(importId, { root: local(jobDir), workDir: local(workDir) });

		await cancelImport(importId);

		await expect(readdir(jobDir)).rejects.toThrow();
		expect(getImportJob(importId)).toBeUndefined();
	});

	it("refuses to cancel while the background pipeline is actually running (applying/restoring/deploying)", async () => {
		root = await mkdtemp(join(tmpdir(), "transfer-cancel-import-running-"));
		const importId = "import-cancel-running-1";
		const jobDir = join(root, importId);
		await mkdir(jobDir, { recursive: true });

		createImportJob(importId, "user-1", "org-dest");
		updateImportJob(importId, { root: local(jobDir), status: "restoring" });

		await expect(cancelImport(importId)).rejects.toThrow(TRPCError);

		expect(getImportJob(importId)?.status).toBe("restoring");
		await expect(readdir(jobDir)).resolves.toEqual([]);
	});

	it("still allows cancelling a job that's only idling on the next user step (e.g. 'planned')", async () => {
		root = await mkdtemp(join(tmpdir(), "transfer-cancel-import-idle-"));
		const importId = "import-cancel-idle-1";
		const jobDir = join(root, importId);
		await mkdir(jobDir, { recursive: true });

		createImportJob(importId, "user-1", "org-dest");
		updateImportJob(importId, { root: local(jobDir), status: "planned" });

		await cancelImport(importId);

		expect(getImportJob(importId)).toBeUndefined();
	});
});

describe("cleanupExpiredImports (T-5.10)", () => {
	let root: string;

	afterEach(async () => {
		if (root) {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("leaves an active (non-terminal status) job alone even past the TTL", async () => {
		root = await mkdtemp(join(tmpdir(), "transfer-cleanup-import-"));
		const importId = "active-past-ttl-1";
		createImportJob(importId, "user-1", "org-dest");
		updateImportJob(importId, { status: "restoring" });

		const farFuture = Date.now() + 2 * 60 * 60 * 1000;
		const expired = await cleanupExpiredImports(farFuture);

		expect(expired.map((j) => j.importId)).not.toContain(importId);
		expect(getImportJob(importId)).toBeDefined();
	});

	it("cleans up a terminal-status job once it's past the TTL", async () => {
		root = await mkdtemp(join(tmpdir(), "transfer-cleanup-import-"));
		const importId = "terminal-past-ttl-1";
		const jobDir = join(root, importId);
		await mkdir(jobDir, { recursive: true });
		createImportJob(importId, "user-1", "org-dest");
		updateImportJob(importId, { root: local(jobDir), status: "done" });

		const farFuture = Date.now() + 2 * 60 * 60 * 1000;
		const expired = await cleanupExpiredImports(farFuture);

		expect(expired.map((j) => j.importId)).toContain(importId);
		expect(getImportJob(importId)).toBeUndefined();
		await expect(readdir(jobDir)).rejects.toThrow();
	});
});
