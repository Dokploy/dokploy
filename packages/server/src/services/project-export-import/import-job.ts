import { TRPCError } from "@trpc/server";
import { apply } from "./apply";
import {
	deleteImportJob,
	getImportJob,
	type ImportJob,
	listExpiredImportJobs,
	RUNNING_IMPORT_STATUSES,
	updateImportJob,
} from "./jobs";
import type { DeployCandidate } from "./post-apply";
import { postApply } from "./post-apply";
import type { TransferWriteDb } from "./queries";
import { remove, safeErrorMessage } from "./remote-fs";
import { restoreDumps } from "./restore";

export type RunImportContext = {
	db: TransferWriteDb;
	organizationId: string;
	enqueueDeploy?: (candidates: DeployCandidate[]) => Promise<void>;
};

const discardImportFiles = async (job: ImportJob | undefined) => {
	if (!job?.root) return;
	await remove(job.root).catch(() => {});
};

export const runImport = (importId: string, ctx: RunImportContext): void => {
	executeImport(importId, ctx).catch(async (error) => {
		const job = getImportJob(importId);
		updateImportJob(importId, {
			status: job?.result ? "done" : "failed",
			partial: !!job?.result,
			error: safeErrorMessage(error),
		});
		if (!job?.result) {
			await discardImportFiles(job);
		}
	});
};

const executeImport = async (
	importId: string,
	ctx: RunImportContext,
): Promise<void> => {
	const job = getImportJob(importId);
	if (!job) {
		throw new Error(`Import job ${importId} not found`);
	}
	if (!job.snapshot || !job.plan || !job.secretsPlain || !job.workDir) {
		throw new Error(
			"Import job is missing snapshot/plan/secrets; inspect, unlock and plan it first",
		);
	}
	const { snapshot, plan, secretsPlain, workDir } = job;

	updateImportJob(importId, {
		status: "applying",
		message: "Applying to database...",
	});
	const result = await apply(
		ctx.db,
		snapshot,
		plan,
		secretsPlain,
		ctx.organizationId,
	);
	updateImportJob(importId, { result });
	updateImportJob(importId, {
		secretsPlain: undefined,
		secretsOriginal: undefined,
	});

	updateImportJob(importId, {
		status: "restoring",
		message: "Restoring database dumps...",
	});
	const restoreErrors = await restoreDumps(ctx.db, snapshot, result, workDir, {
		emit: (message) => updateImportJob(importId, { message }),
	});
	updateImportJob(importId, { restoreErrors });

	updateImportJob(importId, {
		status: "deploying",
		message: "Copying files and preparing deployments...",
	});
	const { deployCandidates, postApplyErrors } = await postApply(
		ctx.db,
		snapshot,
		plan,
		result,
		workDir,
		{
			emit: (message) => updateImportJob(importId, { message }),
		},
	);
	if (postApplyErrors.length > 0) {
		restoreErrors.push(...postApplyErrors);
		updateImportJob(importId, { restoreErrors });
	}
	updateImportJob(importId, { deployCandidates });

	if (ctx.enqueueDeploy && plan.deployAfterImport !== false) {
		await ctx.enqueueDeploy(deployCandidates);
	}

	const partial = restoreErrors.length > 0;
	updateImportJob(importId, {
		status: "done",
		partial,
		message: partial ? "Import completed with some errors" : "Import complete",
		snapshot: undefined,
	});
};

export const cancelImport = async (importId: string): Promise<void> => {
	const job = getImportJob(importId);
	if (!job) {
		return;
	}
	if (RUNNING_IMPORT_STATUSES.has(job.status)) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"This import is still running; wait for it to finish before cancelling it.",
		});
	}
	await discardImportFiles(job);
	deleteImportJob(importId);
};

export const cleanupExpiredImports = async (
	now = Date.now(),
): Promise<ImportJob[]> => {
	const expired = listExpiredImportJobs(now).filter(
		(job) => !RUNNING_IMPORT_STATUSES.has(job.status),
	);
	for (const job of expired) {
		await discardImportFiles(job);
		deleteImportJob(job.importId);
	}
	return expired;
};
