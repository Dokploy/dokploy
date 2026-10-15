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
import type { TransferResult } from "./types";

export type RunImportContext = {
	db: TransferWriteDb;
	organizationId: string;
	enqueueDeploy?: (candidates: DeployCandidate[]) => Promise<void>;
	scheduleJobs?: (result: TransferResult) => Promise<void>;
};

const discardImportFiles = async (job: ImportJob | undefined) => {
	if (!job?.root) return;
	await remove(job.root).catch(() => {});
};

export const runImport = (importId: string, ctx: RunImportContext): void => {
	executeImport(importId, ctx)
		.catch((error) => {
			const job = getImportJob(importId);
			updateImportJob(importId, {
				status: job?.result ? "done" : "failed",
				partial: !!job?.result,
				error: safeErrorMessage(error),
			});
		})
		.finally(() => discardImportFiles(getImportJob(importId)));
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
		message: "Copying files...",
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
	updateImportJob(importId, { message: "Restoring database dumps..." });
	const restoreErrors = [
		...postApplyErrors,
		...(await restoreDumps(ctx.db, snapshot, result, workDir, {
			emit: (message) => updateImportJob(importId, { message }),
			skipServiceIds: new Set(postApplyErrors.map((error) => error.serviceId)),
		})),
	];
	updateImportJob(importId, { restoreErrors, deployCandidates });

	updateImportJob(importId, {
		status: "deploying",
		message: "Preparing deployments...",
	});

	if (ctx.scheduleJobs) {
		await ctx.scheduleJobs(result);
	}

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
