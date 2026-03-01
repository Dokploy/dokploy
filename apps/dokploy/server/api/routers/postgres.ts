import {
	addNewService,
	checkPortInUse,
	checkServiceAccess,
	createMount,
	createPostgres,
	deployPostgres,
	findBackupsByDbId,
	findEnvironmentById,
	findMemberById,
	findPostgresById,
	findProjectById,
	getMountPath,
	IS_CLOUD,
	rebuildDatabase,
	removePostgresById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updatePostgresById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiChangePostgresStatus,
	apiCreatePostgres,
	apiDeployPostgres,
	apiFindOnePostgres,
	apiRebuildPostgres,
	apiResetPostgres,
	apiSaveEnvironmentVariablesPostgres,
	apiSaveExternalPortPostgres,
	apiUpdatePostgres,
	postgres as postgresTable,
} from "@/server/db/schema";
import { environments, projects } from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";

export const postgresRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreatePostgres)
		.mutation(async ({ input, ctx }) => {
			try {
				// Get project from environment
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				if (ctx.user.role === "member") {
					await checkServiceAccess(
						ctx.user.id,
						project.projectId,
						ctx.session.activeOrganizationId,
						"create",
					);
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a Postgres",
					});
				}

				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newPostgres = await createPostgres({
					...input,
				});
				if (ctx.user.role === "member") {
					await addNewService(
						ctx.user.id,
						newPostgres.postgresId,
						project.organizationId,
					);
				}

				const mountPath = getMountPath(input.dockerImage);

				await createMount({
					serviceId: newPostgres.postgresId,
					serviceType: "postgres",
					volumeName: `${newPostgres.appName}-data`,
					mountPath: mountPath,
					type: "volume",
				});

				return newPostgres;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting Postgres database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOnePostgres)
		.query(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.postgresId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}

			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Postgres",
				});
			}
			return postgres;
		}),

	start: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			const service = await findPostgresById(input.postgresId);

			if (
				service.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this Postgres",
				});
			}

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to stop this Postgres",
				});
			}
			if (postgres.serverId) {
				await stopServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await stopService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "idle",
			});

			return postgres;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);

			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
			}

			if (input.externalPort) {
				const portCheck = await checkPortInUse(
					input.externalPort,
					postgres.serverId || undefined,
				);
				if (portCheck.isInUse) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port ${input.externalPort} is already in use by ${portCheck.conflictingContainer}`,
					});
				}
			}

			await updatePostgresById(input.postgresId, {
				externalPort: input.externalPort,
			});
			await deployPostgres(input.postgresId);
			return postgres;
		}),
	deploy: protectedProcedure
		.input(apiDeployPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Postgres",
				});
			}
			return deployPostgres(input.postgresId);
		}),

	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/postgres-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployPostgres)
		.subscription(async function* ({ input, ctx, signal }) {
			const postgres = await findPostgresById(input.postgresId);

			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this Postgres",
				});
			}

			const queue: string[] = [];
			const done = false;

			deployPostgres(input.postgresId, (log) => {
				queue.push(log);
			});

			while (!done || queue.length > 0) {
				if (queue.length > 0) {
					yield queue.shift()!;
				} else {
					await new Promise((r) => setTimeout(r, 50));
				}

				if (signal?.aborted) {
					return;
				}
			}
		}),

	changeStatus: protectedProcedure
		.input(apiChangePostgresStatus)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to change this Postgres status",
				});
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: input.applicationStatus,
			});
			return postgres;
		}),
	remove: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.postgresId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}
			const postgres = await findPostgresById(input.postgresId);

			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this Postgres",
				});
			}

			const backups = await findBackupsByDbId(input.postgresId, "postgres");

			const cleanupOperations = [
				async () => await removeService(postgres?.appName, postgres.serverId),
				async () => await cancelJobs(backups),
				async () => await removePostgresById(input.postgresId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return postgres;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			const service = await updatePostgresById(input.postgresId, {
				env: input.env,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error adding environment variables",
				});
			}

			return true;
		}),
	reload: protectedProcedure
		.input(apiResetPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this Postgres",
				});
			}
			if (postgres.serverId) {
				await stopServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await stopService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "idle",
			});

			if (postgres.serverId) {
				await startServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await startService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "done",
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdatePostgres)
		.mutation(async ({ input, ctx }) => {
			const { postgresId, ...rest } = input;
			const postgres = await findPostgresById(postgresId);
			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this Postgres",
				});
			}

			const service = await updatePostgresById(postgresId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating Postgres",
				});
			}

			return true;
		}),
	move: protectedProcedure
		.input(
			z.object({
				postgresId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this postgres",
				});
			}

			const targetEnvironment = await findEnvironmentById(
				input.targetEnvironmentId,
			);
			if (
				targetEnvironment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move to this environment",
				});
			}

			// Update the postgres's projectId
			const updatedPostgres = await db
				.update(postgresTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(postgresTable.postgresId, input.postgresId))
				.returning()
				.then((res) => res[0]);

			if (!updatedPostgres) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move postgres",
				});
			}

			return updatedPostgres;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildPostgres)
		.mutation(async ({ input, ctx }) => {
			const postgres = await findPostgresById(input.postgresId);
			if (
				postgres.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to rebuild this Postgres database",
				});
			}

			await rebuildDatabase(postgres.postgresId, "postgres");

			return true;
		}),
	search: protectedProcedure
		.input(
			z.object({
				q: z.string().optional(),
				name: z.string().optional(),
				appName: z.string().optional(),
				description: z.string().optional(),
				projectId: z.string().optional(),
				environmentId: z.string().optional(),
				limit: z.number().min(1).max(100).default(20),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			const baseConditions = [
				eq(projects.organizationId, ctx.session.activeOrganizationId),
			];
			if (input.projectId) {
				baseConditions.push(eq(environments.projectId, input.projectId));
			}
			if (input.environmentId) {
				baseConditions.push(
					eq(postgresTable.environmentId, input.environmentId),
				);
			}
			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(postgresTable.name, term),
						ilike(postgresTable.appName, term),
						ilike(postgresTable.description ?? "", term),
					)!,
				);
			}
			if (input.name?.trim()) {
				baseConditions.push(
					ilike(postgresTable.name, `%${input.name.trim()}%`),
				);
			}
			if (input.appName?.trim()) {
				baseConditions.push(
					ilike(postgresTable.appName, `%${input.appName.trim()}%`),
				);
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(
						postgresTable.description ?? "",
						`%${input.description.trim()}%`,
					),
				);
			}
			if (ctx.user.role === "member") {
				const { accessedServices } = await findMemberById(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (accessedServices.length === 0) return { items: [], total: 0 };
				baseConditions.push(
					sql`${postgresTable.postgresId} IN (${sql.join(
						accessedServices.map((id) => sql`${id}`),
						sql`, `,
					)})`,
				);
			}
			const where = and(...baseConditions);
			const [items, countResult] = await Promise.all([
				db
					.select({
						postgresId: postgresTable.postgresId,
						name: postgresTable.name,
						appName: postgresTable.appName,
						description: postgresTable.description,
						environmentId: postgresTable.environmentId,
						applicationStatus: postgresTable.applicationStatus,
						createdAt: postgresTable.createdAt,
					})
					.from(postgresTable)
					.innerJoin(
						environments,
						eq(postgresTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(postgresTable.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(postgresTable)
					.innerJoin(
						environments,
						eq(postgresTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where),
			]);
			return { items, total: countResult[0]?.count ?? 0 };
		}),
});
