import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { DeployCandidate } from "./post-apply";
import type { Location } from "./remote-fs";
import type {
	Plan,
	RestoreError,
	Snapshot,
	TransferResult,
	Warning,
} from "./types";

const JOB_TTL_MS = 60 * 60 * 1000;

const createJobStore = <T extends { createdAt: number }>() => {
	const jobs = new Map<string, T>();
	return {
		set: (id: string, job: T): T => {
			jobs.set(id, job);
			return job;
		},
		get: (id: string): T | undefined => jobs.get(id),
		update: (id: string, patch: Partial<T>): T | undefined => {
			const job = jobs.get(id);
			if (!job) return undefined;
			Object.assign(job, patch);
			return job;
		},
		delete: (id: string): void => {
			jobs.delete(id);
		},
		list: (): T[] => [...jobs.values()],
		listExpired: (now = Date.now()): T[] =>
			[...jobs.values()].filter((job) => now - job.createdAt > JOB_TTL_MS),
	};
};

export type ExportStatus =
	| "pending"
	| "capturing"
	| "dumping"
	| "collecting-files"
	| "serializing"
	| "done"
	| "error"
	| "cancelled";

export type ExportJob = {
	exportId: string;
	userId: string;
	organizationId: string;
	status: ExportStatus;
	message?: string;
	error?: string;
	workspace?: Location;
	bundle?: Location;
	size?: number;
	downloadToken?: string;
	deliveredKey?: string;
	deliveredDestinationId?: string;
	warnings?: Warning[];
	createdAt: number;
};

const exportJobs = createJobStore<ExportJob>();
const tokenToExportId = new Map<string, string>();

export const createExportJob = (
	exportId: string,
	userId: string,
	organizationId: string,
): ExportJob =>
	exportJobs.set(exportId, {
		exportId,
		userId,
		organizationId,
		status: "pending",
		createdAt: Date.now(),
	});

export const getExportJob = exportJobs.get;

export const updateExportJob = (
	exportId: string,
	patch: Partial<
		Omit<ExportJob, "exportId" | "userId" | "organizationId" | "createdAt">
	>,
): ExportJob | undefined => exportJobs.update(exportId, patch);

export const issueDownloadToken = (exportId: string): string | undefined => {
	const job = exportJobs.get(exportId);
	if (!job) {
		return undefined;
	}
	const token = randomBytes(32).toString("hex");
	job.downloadToken = token;
	tokenToExportId.set(token, exportId);
	return token;
};

export const peekDownloadToken = (token: string): ExportJob | undefined => {
	const exportId = tokenToExportId.get(token);
	return exportId ? exportJobs.get(exportId) : undefined;
};

export const invalidateDownloadToken = (token: string): void => {
	const exportId = tokenToExportId.get(token);
	tokenToExportId.delete(token);
	if (exportId) {
		exportJobs.update(exportId, { downloadToken: undefined });
	}
};

export const deleteExportJob = (exportId: string): void => {
	const job = exportJobs.get(exportId);
	if (job?.downloadToken) {
		tokenToExportId.delete(job.downloadToken);
	}
	exportJobs.delete(exportId);
};

export const listExpiredExportJobs = exportJobs.listExpired;

export const listExportJobs = exportJobs.list;

export type ImportStatus =
	| "uploaded"
	| "inspected"
	| "unlocked"
	| "planned"
	| "applying"
	| "restoring"
	| "deploying"
	| "done"
	| "failed";

export type ImportJob = {
	importId: string;
	userId: string;
	organizationId: string;
	status: ImportStatus;
	message?: string;
	error?: string;
	root?: Location;
	bundle?: Location;
	workDir?: Location;
	snapshot?: Snapshot;
	secretsPlain?: Map<string, string>;
	secretsOriginal?: Map<string, string>;
	plan?: Plan;
	result?: TransferResult;
	restoreErrors?: RestoreError[];
	deployCandidates?: DeployCandidate[];
	partial?: boolean;
	createdAt: number;
};

const importJobs = createJobStore<ImportJob>();

export const createImportJob = (
	importId: string,
	userId: string,
	organizationId: string,
): ImportJob =>
	importJobs.set(importId, {
		importId,
		userId,
		organizationId,
		status: "uploaded",
		createdAt: Date.now(),
	});

export const getImportJob = importJobs.get;

export const updateImportJob = (
	importId: string,
	patch: Partial<
		Omit<ImportJob, "importId" | "userId" | "organizationId" | "createdAt">
	>,
): ImportJob | undefined => importJobs.update(importId, patch);

export const deleteImportJob = importJobs.delete;

export const listExpiredImportJobs = importJobs.listExpired;

export const listImportJobs = importJobs.list;

export const ACTIVE_EXPORT_STATUSES = new Set([
	"pending",
	"capturing",
	"dumping",
	"collecting-files",
	"serializing",
]);

const ACTIVE_IMPORT_STATUSES = new Set([
	"uploaded",
	"inspected",
	"unlocked",
	"planned",
	"applying",
	"restoring",
	"deploying",
]);

export const RUNNING_IMPORT_STATUSES = new Set([
	"applying",
	"restoring",
	"deploying",
]);

export const assertNoActiveTransfer = (
	userId: string,
	options?: { excludeImportId?: string },
): void => {
	const activeExport = listExportJobs().some(
		(job) => job.userId === userId && ACTIVE_EXPORT_STATUSES.has(job.status),
	);
	if (activeExport) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"You already have an export in progress; wait for it to finish (or cancel it) before starting another.",
		});
	}

	const activeImport = listImportJobs().some(
		(job) =>
			job.userId === userId &&
			job.importId !== options?.excludeImportId &&
			ACTIVE_IMPORT_STATUSES.has(job.status),
	);
	if (activeImport) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"You already have an import in progress; wait for it to finish (or cancel it) before starting another.",
		});
	}
};

export const createImportJobIfNoneActive = (
	importId: string,
	userId: string,
	organizationId: string,
): ImportJob => {
	assertNoActiveTransfer(userId);
	return createImportJob(importId, userId, organizationId);
};

export const requireExportJob = (exportId: string, organizationId: string) => {
	const job = getExportJob(exportId);
	if (!job || job.organizationId !== organizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });
	}
	return job;
};

export const requireImportJob = (importId: string, organizationId: string) => {
	const job = getImportJob(importId);
	if (!job || job.organizationId !== organizationId) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Import not found" });
	}
	return job;
};

export const requireIdleImportJob = (
	importId: string,
	organizationId: string,
) => {
	const job = requireImportJob(importId, organizationId);
	if (RUNNING_IMPORT_STATUSES.has(job.status)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "This import is already running",
		});
	}
	return job;
};

export const requireOwnImportJob = (
	importId: string,
	organizationId: string,
	userId: string,
) => {
	const job = requireIdleImportJob(importId, organizationId);
	if (job.userId !== userId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only the user who started this import can change its secrets",
		});
	}
	return job;
};
