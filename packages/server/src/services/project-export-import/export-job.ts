import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import { TRPCError } from "@trpc/server";
import { capture } from "./capture";
import {
	buildBundleObjectKey,
	slugifyProjectName,
	uploadBundleToDestination,
} from "./delivery";
import { createDumps } from "./dumps";
import { collectFiles } from "./files";
import {
	ACTIVE_EXPORT_STATUSES,
	createExportJob,
	deleteExportJob,
	type ExportJob,
	getExportJob,
	issueDownloadToken,
	listExpiredExportJobs,
	updateExportJob,
} from "./jobs";
import { loadProjectTree, type TransferDb } from "./queries";
import {
	fileSize,
	type Location,
	prepareRoot,
	remove,
	safeErrorMessage,
	transferRoot,
} from "./remote-fs";
import { detectRequirements } from "./requirements";
import { serialize } from "./serialize";
import { scopedServices } from "./service-kinds";
import type { CaptureSource, ExportScope } from "./types";
import { BUNDLE_EXTENSION, exportScopeSchema } from "./types";
import type { InstanceVersions, RunVersionProbe } from "./versions";
import { collectDockerVersions } from "./versions";
import { detectWarnings } from "./warnings";

export type ExportDeliver =
	| { kind: "download" }
	| { kind: "destination"; destinationId: string };

export type RunExportInput = {
	source: CaptureSource;
	scope: ExportScope;
	passphrase: string;
	deliver?: ExportDeliver;
	buildServerId?: string | null;
};

export type RunExportContext = {
	db: TransferDb;
	userId: string;
	userEmail: string;
	organizationId: string;
	dokployVersion: string;
	instance?: Omit<InstanceVersions, "dokployVersion">;
	pathsFn?: typeof paths;
	probeVersion?: RunVersionProbe;
};

export const fullExportScope = (): ExportScope =>
	exportScopeSchema.parse({ dumps: { mode: "embed" } });

export const bundleBuildServer = async (
	db: TransferDb,
	projectId: string,
	scope: ExportScope,
): Promise<string | null> => {
	const tree = await loadProjectTree(db, { kind: "project", id: projectId });
	const serverIds = new Set(
		tree
			? scopedServices(tree, scope).map(
					({ service }) => (service.serverId as string | null) ?? null,
				)
			: [],
	);
	const remote = [...serverIds].find((id): id is string => !!id);
	if (IS_CLOUD) {
		if (!remote) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					"On Dokploy Cloud the export is built on the project's server, but none of the selected services runs on a remote server",
			});
		}
		return remote;
	}
	return serverIds.size === 1 && remote ? remote : null;
};

const discardExportFiles = async (job: ExportJob) => {
	if (!job.workspace) return;
	await remove(job.workspace).catch(() => {});
	await remove({
		...job.workspace,
		path: `${job.workspace.path}${BUNDLE_EXTENSION}`,
	}).catch(() => {});
};

export const runExport = (
	input: RunExportInput,
	ctx: RunExportContext,
): { exportId: string } => {
	const job = createExportJob(randomUUID(), ctx.userId, ctx.organizationId);
	job.workspace = transferRoot(
		job.exportId,
		input.buildServerId ?? null,
		ctx.pathsFn ?? paths,
	);
	void executeExport(job, input, ctx);
	return { exportId: job.exportId };
};

export const runExportBatch = (
	inputs: RunExportInput[],
	ctx: RunExportContext,
): { exportIds: string[] } => {
	const jobs = inputs.map((input) => {
		const job = createExportJob(randomUUID(), ctx.userId, ctx.organizationId);
		job.workspace = transferRoot(
			job.exportId,
			input.buildServerId ?? null,
			ctx.pathsFn ?? paths,
		);
		return { job, input };
	});
	void (async () => {
		for (const { job, input } of jobs) {
			await executeExport(job, input, ctx);
		}
	})();
	return { exportIds: jobs.map(({ job }) => job.exportId) };
};

const executeExport = (
	job: ExportJob,
	input: RunExportInput,
	ctx: RunExportContext,
): Promise<void> =>
	buildExport(job, input, ctx)
		.catch(async (error) => {
			updateExportJob(job.exportId, {
				status: "error",
				error: safeErrorMessage(error),
			});
			await discardExportFiles(job);
		})
		.finally(() => {
			// The TTL runs from createdAt; restart it so the result stays available
			// for the full window however long the export (or its batch) took.
			job.createdAt = Date.now();
		});

const buildExport = async (
	job: ExportJob,
	input: RunExportInput,
	ctx: RunExportContext,
): Promise<void> => {
	const { exportId } = job;
	const workDir = job.workspace as Location;
	const { LOGS_PATH } = (ctx.pathsFn ?? paths)();
	await prepareRoot(workDir);
	const bundle = { ...workDir, path: `${workDir.path}${BUNDLE_EXTENSION}` };
	const logPath = join(LOGS_PATH, `project-export-${exportId}.log`);
	await mkdir(dirname(logPath), { recursive: true });

	const emit = (message: string) => {
		updateExportJob(exportId, { message });
		void appendFile(
			logPath,
			`[${new Date().toISOString()}] ${message}\n`,
		).catch(() => {});
	};

	updateExportJob(exportId, { status: "capturing" });
	emit("Reading project tree...");
	const captureResult = await capture(ctx.db, input.source, input.scope, {
		detectRequirements: (tree, scope) =>
			detectRequirements(ctx.db, tree, scope),
		detectWarnings: (tree, scope) => detectWarnings(tree, scope),
	});
	emit(`Captured ${captureResult.resources.services.length} services`);
	const dockerVersions = await collectDockerVersions(
		captureResult.tree,
		input.scope,
		ctx.probeVersion,
	);

	updateExportJob(exportId, { status: "dumping" });
	const { dumps, warnings: dumpWarnings } = await createDumps(
		ctx.db,
		captureResult.tree,
		input.scope,
		workDir,
		{ emit },
	);

	updateExportJob(exportId, { status: "collecting-files" });
	const { warnings: fileWarnings } = await collectFiles(
		captureResult.tree,
		input.scope,
		captureResult.requirements,
		workDir,
		{ emit, pathsFn: ctx.pathsFn },
	);
	const jobWarnings = [...dumpWarnings, ...fileWarnings];

	updateExportJob(exportId, { status: "serializing" });
	const estimatedDumpBytes = dumps.reduce(
		(sum, dump) => sum + (dump.mode === "embed" ? dump.bytes : 0),
		0,
	);
	await serialize(
		{
			resources: captureResult.resources,
			inventory: { ...captureResult.inventory, estimatedDumpBytes },
			requirements: captureResult.requirements,
			warnings: [...captureResult.warnings, ...jobWarnings],
			dumps,
			scope: input.scope,
			organizationId: ctx.organizationId,
			dokployVersion: ctx.dokployVersion,
			instanceInfo: { ...ctx.instance, dockerVersions },
			exportedBy: { userId: ctx.userId, email: ctx.userEmail },
		},
		captureResult.secretsPlain,
		input.passphrase,
		workDir,
		bundle,
	);

	const size = await fileSize(bundle);
	const deliver = input.deliver ?? { kind: "download" };
	const summary =
		jobWarnings.length > 0
			? `Export complete with ${jobWarnings.length} warning(s)`
			: "Export complete";

	if (deliver.kind === "destination") {
		updateExportJob(exportId, { message: "Uploading to destination..." });
		const destination = await ctx.db.query.destinations.findFirst({
			where: (fields, { eq }) =>
				eq(fields.destinationId, deliver.destinationId),
		});
		if (!destination) {
			throw new Error(`Destination ${deliver.destinationId} not found`);
		}
		const key = buildBundleObjectKey(
			slugifyProjectName(captureResult.resources.project.name as string),
			new Date().toISOString(),
		);
		await uploadBundleToDestination(destination, bundle, key);
		await remove(bundle);
		updateExportJob(exportId, {
			status: "done",
			size,
			deliveredKey: key,
			deliveredDestinationId: destination.destinationId,
			warnings: jobWarnings,
		});
		emit(`${summary}, uploaded to ${key}`);
		return;
	}

	const downloadToken = issueDownloadToken(exportId);
	updateExportJob(exportId, {
		status: "done",
		bundle,
		size,
		downloadToken,
		warnings: jobWarnings,
	});
	emit(`${summary} (${size} bytes)`);
};

export const cancelExport = async (exportId: string): Promise<void> => {
	const job = getExportJob(exportId);
	if (!job) {
		return;
	}
	if (ACTIVE_EXPORT_STATUSES.has(job.status)) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"This export is still running; wait for it to finish before cancelling it.",
		});
	}
	await discardExportFiles(job);
	updateExportJob(exportId, { status: "cancelled" });
	deleteExportJob(exportId);
};

export const cleanupExpiredExports = async (
	now = Date.now(),
): Promise<ExportJob[]> => {
	const expired = listExpiredExportJobs(now).filter(
		(job) => !ACTIVE_EXPORT_STATUSES.has(job.status),
	);
	for (const job of expired) {
		await discardExportFiles(job);
		deleteExportJob(job.exportId);
	}
	return expired;
};
