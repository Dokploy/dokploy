import { randomUUID } from "node:crypto";
import {
	findBackupById,
	getDokployImageTag,
	IS_CLOUD,
	scheduleBackup,
	scheduleJob,
	scheduleVolumeBackup,
	TRAEFIK_VERSION,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import type {
	DeployCandidate,
	InstanceVersions,
	TransferResult,
} from "@dokploy/server/services/project-export-import";
import {
	assertNoActiveTransfer,
	assertPlanChecksPass,
	assertTransferPermission,
	at,
	BUNDLE_EXTENSION,
	buildPlan,
	bundleBuildServer,
	cancelExport,
	cancelImport,
	capture,
	compareInstanceVersions,
	conflictResolutionSchema,
	createImportJobIfNoneActive,
	deleteBundleFromDestination,
	detectRequirements,
	detectWarnings,
	domainStrategySchema,
	downloadBundleFromDestination,
	EXPORTS_DIRECTORY,
	estimateSizes,
	exportScopeSchema,
	findOrganizationDestination,
	findOrganizationServerId,
	fullExportScope,
	getExportJob,
	inspectBundle,
	listBundles,
	listReviewableSecrets,
	prepareRoot,
	proposeResolutions,
	remove,
	requireExportJob,
	requireIdleImportJob,
	requireImportJob,
	requireOwnImportJob,
	resolutionSchema,
	runExport,
	runExportBatch,
	runImport,
	safeErrorMessage,
	TransferCryptoError,
	targetSchema,
	transferRoot,
	UnsupportedBundleVersionError,
	unlockBundle,
	updateImportJob,
	validatePlan,
	verifyBundlePassphrase,
} from "@dokploy/server/services/project-export-import";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PLAN_LIMITS } from "@/server/api/utils/plan-limits";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { schedule } from "@/server/utils/backup";
import { getCurrentPlan } from "@/server/utils/billing";
import { deploy } from "@/server/utils/deploy";
import packageInfo from "../../../package.json";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { audit } from "../utils/audit";

const localInstance = (): InstanceVersions => ({
	dokployVersion: packageInfo.version,
	releaseTag: getDokployImageTag(),
	isCloud: IS_CLOUD,
	traefikVersion: TRAEFIK_VERSION,
	nodeVersion: process.version,
});

const localInstanceContext = () => {
	const { dokployVersion, ...instance } = localInstance();
	return { dokployVersion, instance };
};

const scheduleImportedJobs = async (result: TransferResult): Promise<void> => {
	const serviceIds = Object.values(result.idMap).flatMap((ids) =>
		Object.values(ids),
	);
	if (serviceIds.length === 0) return;

	const [importedBackups, importedVolumeBackups, importedSchedules] =
		await Promise.all([
			db.query.backups.findMany({
				where: (fields, { and, eq, inArray, or }) =>
					and(
						eq(fields.enabled, true),
						or(
							inArray(fields.postgresId, serviceIds),
							inArray(fields.mysqlId, serviceIds),
							inArray(fields.mariadbId, serviceIds),
							inArray(fields.mongoId, serviceIds),
							inArray(fields.libsqlId, serviceIds),
							inArray(fields.composeId, serviceIds),
						),
					),
				columns: { backupId: true },
			}),
			db.query.volumeBackups.findMany({
				where: (fields, { and, eq, inArray, or }) =>
					and(
						eq(fields.enabled, true),
						or(
							inArray(fields.applicationId, serviceIds),
							inArray(fields.postgresId, serviceIds),
							inArray(fields.mysqlId, serviceIds),
							inArray(fields.mariadbId, serviceIds),
							inArray(fields.mongoId, serviceIds),
							inArray(fields.redisId, serviceIds),
							inArray(fields.libsqlId, serviceIds),
							inArray(fields.composeId, serviceIds),
						),
					),
			}),
			db.query.schedules.findMany({
				where: (fields, { and, eq, inArray, or }) =>
					and(
						eq(fields.enabled, true),
						or(
							inArray(fields.applicationId, serviceIds),
							inArray(fields.composeId, serviceIds),
						),
					),
			}),
		]);

	for (const { backupId } of importedBackups) {
		const backup = await findBackupById(backupId);
		if (IS_CLOUD) {
			await schedule({
				cronSchedule: backup.schedule,
				backupId,
				type: "backup",
			});
		} else {
			scheduleBackup(backup);
		}
	}
	for (const volumeBackup of importedVolumeBackups) {
		if (IS_CLOUD) {
			await schedule({
				cronSchedule: volumeBackup.cronExpression,
				volumeBackupId: volumeBackup.volumeBackupId,
				type: "volume-backup",
			});
		} else {
			await scheduleVolumeBackup(volumeBackup.volumeBackupId);
		}
	}
	for (const importedSchedule of importedSchedules) {
		if (IS_CLOUD) {
			await schedule({
				scheduleId: importedSchedule.scheduleId,
				type: "schedule",
				cronSchedule: importedSchedule.cronExpression,
				timezone: importedSchedule.timezone,
			});
		} else {
			scheduleJob(importedSchedule);
		}
	}
};

const enqueueImportDeploys = async (
	candidates: DeployCandidate[],
): Promise<void> => {
	for (const candidate of candidates) {
		const jobData: DeploymentJob =
			candidate.serviceType === "application"
				? {
						applicationId: candidate.serviceId,
						titleLog: "Imported from bundle",
						descriptionLog: "",
						type: "deploy",
						applicationType: "application",
						server: !!candidate.serverId,
						serverId: candidate.serverId ?? undefined,
					}
				: {
						composeId: candidate.serviceId,
						titleLog: "Imported from bundle",
						descriptionLog: "",
						type: "deploy",
						applicationType: "compose",
						server: !!candidate.serverId,
						serverId: candidate.serverId ?? undefined,
					};

		if (IS_CLOUD && candidate.serverId) {
			deploy(jobData).catch((error) => {
				console.error("Background import deployment failed:", error);
			});
		} else {
			await myQueue.add(
				"deployments",
				{ ...jobData },
				{ removeOnComplete: true, removeOnFail: true },
			);
		}
	}
};

export const projectExportImportRouter = createTRPCRouter({
	exportPreview: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				environmentIds: z.array(z.string()).optional(),
				serviceIds: z.array(z.string()).optional(),
				files: exportScopeSchema.shape.files.optional(),
				dumps: exportScopeSchema.shape.dumps.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, input.projectId, "export");
			const scope = exportScopeSchema.parse(input);
			const result = await capture(
				db,
				{ kind: "project", id: input.projectId },
				scope,
				{
					detectRequirements: (tree, scope) =>
						detectRequirements(db, tree, scope),
					detectWarnings: (tree, scope) => detectWarnings(tree, scope),
				},
			);
			const sizes = await estimateSizes(result.tree, scope);
			return {
				inventory: { ...result.inventory, ...sizes },
				requirements: result.requirements,
				warnings: result.warnings,
			};
		}),

	exportStart: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				scope: exportScopeSchema,
				passphrase: z.string().min(12),
				deliver: z
					.union([
						z.object({ kind: z.literal("download") }),
						z.object({
							kind: z.literal("destination"),
							destinationId: z.string(),
						}),
					])
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, input.projectId, "export");
			assertNoActiveTransfer(ctx.user.id);

			if (IS_CLOUD && (!input.deliver || input.deliver.kind === "download")) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Downloading a bundle directly is not available on Dokploy Cloud; choose a destination to deliver it to instead.",
				});
			}
			if (input.deliver?.kind === "destination") {
				await findOrganizationDestination(
					input.deliver.destinationId,
					ctx.session.activeOrganizationId,
				);
			}

			const { exportId } = runExport(
				{
					source: { kind: "project", id: input.projectId },
					scope: input.scope,
					passphrase: input.passphrase,
					deliver: input.deliver,
					buildServerId: await bundleBuildServer(
						db,
						input.projectId,
						input.scope,
					),
				},
				{
					db,
					userId: ctx.user.id,
					userEmail: ctx.user.email,
					organizationId: ctx.session.activeOrganizationId,
					...localInstanceContext(),
				},
			);
			await audit(ctx, {
				action: "export",
				resourceType: "project",
				resourceId: input.projectId,
			});
			return { exportId };
		}),

	listRemoteBundles: protectedProcedure
		.input(z.object({ destinationId: z.string() }))
		.query(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, undefined, "import");
			const destination = await findOrganizationDestination(
				input.destinationId,
				ctx.session.activeOrganizationId,
			);
			try {
				return await listBundles(destination);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to list bundles: ${safeErrorMessage(error)}`,
				});
			}
		}),

	verifyBundlePassphrase: protectedProcedure
		.input(
			z.object({
				destinationId: z.string(),
				key: z.string(),
				passphrase: z.string().min(12),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, undefined, "import");
			const destination = await findOrganizationDestination(
				input.destinationId,
				ctx.session.activeOrganizationId,
			);
			try {
				return await verifyBundlePassphrase(
					destination,
					input.key,
					input.passphrase,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to read the bundle: ${safeErrorMessage(error)}`,
				});
			}
		}),

	exportOrganizationStart: protectedProcedure
		.input(
			z.object({
				destinationId: z.string(),
				passphrase: z.string().min(12),
				projectIds: z.array(z.string()).min(1).max(200),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, undefined, "export");
			assertNoActiveTransfer(ctx.user.id);
			await findOrganizationDestination(
				input.destinationId,
				ctx.session.activeOrganizationId,
			);
			const projectIds = [...new Set(input.projectIds)];
			const projects = await db.query.projects.findMany({
				where: (fields, { eq, and, inArray }) =>
					and(
						eq(fields.organizationId, ctx.session.activeOrganizationId),
						inArray(fields.projectId, projectIds),
					),
				columns: { projectId: true, name: true },
			});
			if (projects.length !== projectIds.length) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			const scope = fullExportScope();
			const planned = await Promise.all(
				projects.map(async (project) => {
					try {
						const buildServerId = await bundleBuildServer(
							db,
							project.projectId,
							scope,
						);
						return { project, buildServerId, skipped: undefined };
					} catch (error) {
						if (error instanceof TRPCError && error.code === "BAD_REQUEST") {
							return { project, buildServerId: null, skipped: error.message };
						}
						throw error;
					}
				}),
			);
			const exportable = planned.filter((entry) => !entry.skipped);
			if (exportable.length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "None of the selected projects can be exported",
				});
			}
			const { exportIds } = runExportBatch(
				exportable.map(({ project, buildServerId }) => ({
					source: { kind: "project" as const, id: project.projectId },
					scope,
					passphrase: input.passphrase,
					deliver: {
						kind: "destination" as const,
						destinationId: input.destinationId,
					},
					buildServerId,
				})),
				{
					db,
					userId: ctx.user.id,
					userEmail: ctx.user.email,
					organizationId: ctx.session.activeOrganizationId,
					...localInstanceContext(),
				},
			);
			await audit(ctx, {
				action: "export",
				resourceType: "organization",
				resourceId: ctx.session.activeOrganizationId,
			});
			return {
				exports: exportable.map(({ project }, index) => ({
					projectId: project.projectId,
					name: project.name,
					exportId: exportIds[index] as string,
				})),
				skipped: planned.flatMap(({ project, skipped }) =>
					skipped
						? [
								{
									projectId: project.projectId,
									name: project.name,
									reason: skipped,
								},
							]
						: [],
				),
			};
		}),

	exportBatchStatus: protectedProcedure
		.input(z.object({ exportIds: z.array(z.string()).max(200) }))
		.query(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, undefined, "export");
			return input.exportIds.map((exportId) => {
				const job = getExportJob(exportId);
				return job && job.organizationId === ctx.session.activeOrganizationId
					? {
							exportId,
							status: job.status,
							message: job.message,
							error: job.error,
							deliveredKey: job.deliveredKey,
							size: job.size,
						}
					: { exportId, status: "error" as const, error: "Export not found" };
			});
		}),

	deleteRemoteBundle: protectedProcedure
		.input(z.object({ destinationId: z.string(), key: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, undefined, "export");
			if (
				!input.key.startsWith(`${EXPORTS_DIRECTORY}/`) ||
				!input.key.endsWith(BUNDLE_EXTENSION) ||
				input.key.includes("..")
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Only export bundles can be deleted from here",
				});
			}
			const destination = await findOrganizationDestination(
				input.destinationId,
				ctx.session.activeOrganizationId,
			);
			try {
				await deleteBundleFromDestination(destination, input.key);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to delete bundle: ${safeErrorMessage(error)}`,
				});
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "destination",
				resourceId: input.destinationId,
			});
			return { deleted: true };
		}),

	importFromDestination: protectedProcedure
		.input(
			z.object({
				destinationId: z.string(),
				key: z.string(),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertTransferPermission(ctx, undefined, "import");
			assertNoActiveTransfer(ctx.user.id);
			const serverId = await findOrganizationServerId(
				input.serverId,
				ctx.session.activeOrganizationId,
			);
			const destination = await findOrganizationDestination(
				input.destinationId,
				ctx.session.activeOrganizationId,
			);

			const importId = randomUUID();
			const root = transferRoot(importId, serverId);
			const bundle = at(root, "bundle.dokploy.tar.gz");
			try {
				await prepareRoot(root);
				await downloadBundleFromDestination(destination, input.key, bundle);
			} catch (error) {
				await remove(root).catch(() => {});
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to download bundle: ${safeErrorMessage(error)}`,
				});
			}

			try {
				createImportJobIfNoneActive(
					importId,
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				await remove(root).catch(() => {});
				throw error;
			}
			updateImportJob(importId, { root, bundle, status: "uploaded" });

			return { importId, serverId };
		}),

	exportStatus: protectedProcedure
		.input(z.object({ exportId: z.string() }))
		.query(async ({ ctx, input }) => {
			const job = requireExportJob(
				input.exportId,
				ctx.session.activeOrganizationId,
			);
			await assertTransferPermission(ctx, undefined, "export");
			const {
				workspace: _workspace,
				bundle: _bundle,
				userId: _userId,
				...publicJob
			} = job;
			return publicJob;
		}),

	exportCancel: protectedProcedure
		.input(z.object({ exportId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			requireExportJob(input.exportId, ctx.session.activeOrganizationId);
			await assertTransferPermission(ctx, undefined, "export");
			await cancelExport(input.exportId);
			return { success: true };
		}),

	importInspect: protectedProcedure
		.input(z.object({ importId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const job = requireImportJob(
				input.importId,
				ctx.session.activeOrganizationId,
			);
			await assertTransferPermission(ctx, undefined, "import");
			if (!job.bundle || !job.root) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Import has no uploaded bundle",
				});
			}

			const workDir = at(job.root, "extracted");
			let inspected: Awaited<ReturnType<typeof inspectBundle>>;
			try {
				inspected = await inspectBundle(job.bundle, workDir);
			} catch (error) {
				if (error instanceof UnsupportedBundleVersionError) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: error.message,
					});
				}
				throw error;
			}
			updateImportJob(input.importId, { status: "inspected", workDir });

			const { crypto: _crypto, ...publicManifest } = inspected.manifest;
			const destination = localInstance();
			return {
				manifest: publicManifest,
				inventory: inspected.inventory,
				requirements: inspected.requirements,
				warnings: inspected.warnings,
				versions: { source: publicManifest.sourceInstance, destination },
				versionWarnings: compareInstanceVersions(
					publicManifest.sourceInstance,
					destination,
				),
			};
		}),

	importUnlock: protectedProcedure
		.input(z.object({ importId: z.string(), passphrase: z.string().min(12) }))
		.mutation(async ({ ctx, input }) => {
			const job = requireImportJob(
				input.importId,
				ctx.session.activeOrganizationId,
			);
			await assertTransferPermission(ctx, undefined, "import");
			if (!job.workDir) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Call importInspect before importUnlock",
				});
			}

			let unlocked: Awaited<ReturnType<typeof unlockBundle>>;
			try {
				unlocked = await unlockBundle(job.workDir, input.passphrase);
			} catch (error) {
				if (error instanceof TransferCryptoError) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Incorrect passphrase",
					});
				}
				throw error;
			}

			updateImportJob(input.importId, {
				status: "unlocked",
				snapshot: unlocked.snapshot,
				secretsPlain: unlocked.secretsPlain,
			});

			const resolutions = await proposeResolutions(
				db,
				unlocked.snapshot,
				ctx.session.activeOrganizationId,
			);

			return { resolutions };
		}),

	importSecrets: protectedProcedure
		.input(z.object({ importId: z.string() }))
		.query(async ({ ctx, input }) => {
			const job = requireImportJob(
				input.importId,
				ctx.session.activeOrganizationId,
			);
			await assertTransferPermission(ctx, undefined, "import");
			if (!job.snapshot) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Call importUnlock before importSecrets",
				});
			}
			return listReviewableSecrets(job.snapshot);
		}),

	importSecretReveal: protectedProcedure
		.input(z.object({ importId: z.string(), secretId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const job = requireOwnImportJob(
				input.importId,
				ctx.session.activeOrganizationId,
				ctx.user.id,
			);
			await assertTransferPermission(ctx, undefined, "import");
			if (!job.snapshot || !job.secretsPlain) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Call importUnlock before revealing secrets",
				});
			}
			const reviewable = listReviewableSecrets(job.snapshot).some(
				(entry) => entry.secretId === input.secretId,
			);
			if (!reviewable) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Secret not found" });
			}
			return { value: job.secretsPlain.get(input.secretId) ?? "" };
		}),

	importSecretsOverride: protectedProcedure
		.input(
			z.object({
				importId: z.string(),
				overrides: z.record(z.string(), z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const job = requireOwnImportJob(
				input.importId,
				ctx.session.activeOrganizationId,
				ctx.user.id,
			);
			await assertTransferPermission(ctx, undefined, "import");
			if (!job.snapshot || !job.secretsPlain) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Call importUnlock before overriding secrets",
				});
			}
			const reviewable = listReviewableSecrets(job.snapshot).map(
				(entry) => entry.secretId,
			);
			for (const secretId of Object.keys(input.overrides)) {
				if (!reviewable.includes(secretId)) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Secret not found",
					});
				}
			}
			const originals = job.secretsOriginal ?? new Map(job.secretsPlain);
			for (const secretId of reviewable) {
				job.secretsPlain.set(
					secretId,
					input.overrides[secretId] ?? originals.get(secretId) ?? "",
				);
			}
			updateImportJob(input.importId, { secretsOriginal: originals });
			return { overridden: Object.keys(input.overrides).length };
		}),

	importPlan: protectedProcedure
		.input(
			z.object({
				importId: z.string(),
				target: targetSchema,
				choices: z.object({
					resolutions: z.record(z.string(), resolutionSchema).optional(),
					keepAppNames: z.boolean().optional(),
					domainStrategy: domainStrategySchema.optional(),
					portsStrategy: z.enum(["keep", "disable"]).optional(),
					rotateDatabaseCredentials: z.boolean().optional(),
					conflictResolutions: z
						.record(z.string(), conflictResolutionSchema)
						.optional(),
					deployAfterImport: z.boolean().optional(),
				}),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const job = requireIdleImportJob(
				input.importId,
				ctx.session.activeOrganizationId,
			);
			const targetProjectId =
				input.target.kind === "existingProject"
					? input.target.projectId
					: undefined;
			await assertTransferPermission(ctx, targetProjectId, "import");
			if (!job.snapshot) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Call importUnlock before importPlan",
				});
			}

			const environmentsToCreate = job.snapshot.resources.environments.length;
			const existingEnvironments = targetProjectId
				? (
						await db.query.environments.findMany({
							where: (fields, { eq }) => eq(fields.projectId, targetProjectId),
							columns: { environmentId: true },
						})
					).length
				: 0;
			const billingPlan = await getCurrentPlan(
				ctx.session.activeOrganizationId,
			);
			const limit = PLAN_LIMITS[billingPlan ?? "legacy"].environment;
			if (existingEnvironments + environmentsToCreate > limit) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: targetProjectId
						? `This project has ${existingEnvironments} environment(s) and the bundle needs ${environmentsToCreate} more, which exceeds your plan's limit of ${limit}. Upgrade your plan to import it.`
						: `This bundle needs ${environmentsToCreate} environments, which exceeds your plan's limit of ${limit}. Upgrade your plan to import it.`,
				});
			}

			const plan = await buildPlan(
				db,
				job.snapshot,
				ctx.session.activeOrganizationId,
				input.target,
				input.choices,
			);
			plan.warnings.push(
				...compareInstanceVersions(
					job.snapshot.manifest.sourceInstance,
					localInstance(),
				),
			);
			updateImportJob(input.importId, { status: "planned", plan });

			return {
				summary: plan.summary,
				pendingServices: plan.pendingServices,
				warnings: plan.warnings,
				conflicts: plan.conflicts,
				conflictResolutions: plan.conflictResolutions ?? {},
			};
		}),

	importValidate: protectedProcedure
		.input(z.object({ importId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const job = requireIdleImportJob(
				input.importId,
				ctx.session.activeOrganizationId,
			);
			await assertTransferPermission(
				ctx,
				job.plan?.target.kind === "existingProject"
					? job.plan.target.projectId
					: undefined,
				"import",
			);
			if (!job.plan || !job.snapshot) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Call importPlan before importValidate",
				});
			}
			const checks = await validatePlan(
				db,
				job.snapshot,
				job.plan,
				ctx.session.activeOrganizationId,
			);
			updateImportJob(input.importId, {
				plan: { ...job.plan, validation: checks },
			});
			return { checks };
		}),

	importStart: protectedProcedure
		.input(z.object({ importId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const job = requireIdleImportJob(
				input.importId,
				ctx.session.activeOrganizationId,
			);
			await assertTransferPermission(
				ctx,
				job.plan?.target.kind === "existingProject"
					? job.plan.target.projectId
					: undefined,
				"import",
			);
			assertNoActiveTransfer(ctx.user.id, {
				excludeImportId: input.importId,
			});
			if (!job.plan || !job.snapshot) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Call importPlan before importStart",
				});
			}

			if (job.status !== "planned") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This import has already been started",
				});
			}

			updateImportJob(input.importId, { status: "applying" });
			try {
				assertPlanChecksPass(
					await validatePlan(
						db,
						job.snapshot,
						job.plan,
						ctx.session.activeOrganizationId,
					),
				);
			} catch (error) {
				updateImportJob(input.importId, { status: "planned" });
				throw error;
			}

			runImport(input.importId, {
				db,
				organizationId: ctx.session.activeOrganizationId,
				enqueueDeploy: enqueueImportDeploys,
				scheduleJobs: scheduleImportedJobs,
			});

			await audit(ctx, {
				action: "import",
				resourceType: "project",
				resourceId: input.importId,
			});

			return { success: true };
		}),

	importStatus: protectedProcedure
		.input(z.object({ importId: z.string() }))
		.query(async ({ ctx, input }) => {
			const job = requireImportJob(
				input.importId,
				ctx.session.activeOrganizationId,
			);
			await assertTransferPermission(ctx, undefined, "import");
			const {
				secretsPlain: _secretsPlain,
				secretsOriginal: _secretsOriginal,
				snapshot: _snapshot,
				...publicJob
			} = job;
			return publicJob;
		}),

	importCancel: protectedProcedure
		.input(z.object({ importId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			requireImportJob(input.importId, ctx.session.activeOrganizationId);
			await assertTransferPermission(ctx, undefined, "import");
			await cancelImport(input.importId);
			return { success: true };
		}),
});
