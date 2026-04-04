import {
	checkPortInUse,
	createMount,
	createPostgres,
	deployPostgres,
	execAsync,
	execAsyncRemote,
	findBackupsByDbId,
	findEnvironmentById,
	findPostgresById,
	findProjectById,
	getMountPath,
	getServiceContainerCommand,
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
import {
	addNewService,
	checkServiceAccess,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
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
	DATABASE_PASSWORD_MESSAGE,
	DATABASE_PASSWORD_REGEX,
	environments,
	postgres as postgresTable,
	projects,
} from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";

export const postgresRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreatePostgres)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

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
				await addNewService(ctx, newPostgres.postgresId);

				const mountPath = getMountPath(input.dockerImage);

				await createMount({
					serviceId: newPostgres.postgresId,
					serviceType: "postgres",
					volumeName: `${newPostgres.appName}-data`,
					mountPath: mountPath,
					type: "volume",
				});

				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newPostgres.postgresId,
					resourceName: newPostgres.appName,
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
			await checkServiceAccess(ctx, input.postgresId, "read");

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
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				deployment: ["create"],
			});
			const service = await findPostgresById(input.postgresId);

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "done",
			});

			await audit(ctx, {
				action: "start",
				resourceType: "service",
				resourceId: service.postgresId,
				resourceName: service.appName,
			});
			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				deployment: ["create"],
			});
			const postgres = await findPostgresById(input.postgresId);
			if (postgres.serverId) {
				await stopServiceRemote(postgres.serverId, postgres.appName);
			} else {
				await stopService(postgres.appName);
			}
			await updatePostgresById(input.postgresId, {
				applicationStatus: "idle",
			});

			await audit(ctx, {
				action: "stop",
				resourceType: "service",
				resourceId: postgres.postgresId,
				resourceName: postgres.appName,
			});
			return postgres;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortPostgres)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				service: ["create"],
			});
			const postgres = await findPostgresById(input.postgresId);

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
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: postgres.postgresId,
				resourceName: postgres.appName,
			});
			return postgres;
		}),
	deploy: protectedProcedure
		.input(apiDeployPostgres)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				deployment: ["create"],
			});
			const postgres = await findPostgresById(input.postgresId);
			await audit(ctx, {
				action: "deploy",
				resourceType: "service",
				resourceId: postgres.postgresId,
				resourceName: postgres.appName,
			});
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
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				deployment: ["create"],
			});

			const queue: string[] = [];
			let done = false;

			deployPostgres(input.postgresId, (log) => {
				queue.push(log);
			})
				.catch(() => {})
				.finally(() => {
					done = true;
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
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				deployment: ["create"],
			});
			const postgres = await findPostgresById(input.postgresId);
			await updatePostgresById(input.postgresId, {
				applicationStatus: input.applicationStatus,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: postgres.postgresId,
				resourceName: postgres.appName,
			});
			return postgres;
		}),
	remove: protectedProcedure
		.input(apiFindOnePostgres)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.postgresId, "delete");
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

			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: postgres.postgresId,
				resourceName: postgres.appName,
			});
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
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				envVars: ["write"],
			});
			const service = await updatePostgresById(input.postgresId, {
				env: input.env,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error adding environment variables",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: input.postgresId,
			});
			return true;
		}),
	reload: protectedProcedure
		.input(apiResetPostgres)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				deployment: ["create"],
			});
			const postgres = await findPostgresById(input.postgresId);
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
			await audit(ctx, {
				action: "reload",
				resourceType: "service",
				resourceId: postgres.postgresId,
				resourceName: postgres.appName,
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdatePostgres)
		.mutation(async ({ input, ctx }) => {
			const { postgresId, ...rest } = input;
			await checkServicePermissionAndAccess(ctx, postgresId, {
				service: ["create"],
			});

			const service = await updatePostgresById(postgresId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating Postgres",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: postgresId,
				resourceName: service.appName,
			});
			return true;
		}),
	changePassword: protectedProcedure
		.input(
			z.object({
				postgresId: z.string().min(1),
				password: z
					.string()
					.min(1)
					.regex(DATABASE_PASSWORD_REGEX, {
						message: DATABASE_PASSWORD_MESSAGE,
					}),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { postgresId, password } = input;
			await checkServicePermissionAndAccess(ctx, postgresId, {
				service: ["create"],
			});

			const pg = await findPostgresById(postgresId);
			const { appName, serverId, databaseUser } = pg;

			const containerCmd = getServiceContainerCommand(appName);
			const command = `
				CONTAINER_ID=$(${containerCmd})
				if [ -z "$CONTAINER_ID" ]; then
					echo "No running container found for ${appName}" >&2
					exit 1
				fi
				docker exec "$CONTAINER_ID" psql -U ${databaseUser} -c "ALTER USER \\"${databaseUser}\\" WITH PASSWORD '${password}';"
			`;

			await db.transaction(async (tx) => {
				await tx
					.update(postgresTable)
					.set({ databasePassword: password })
					.where(eq(postgresTable.postgresId, postgresId));

				if (serverId) {
					await execAsyncRemote(serverId, command);
				} else {
					await execAsync(command, { shell: "/bin/bash" });
				}
			});

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: postgresId,
				resourceName: appName,
			});

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
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				service: ["create"],
			});

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

			await audit(ctx, {
				action: "move",
				resourceType: "service",
				resourceId: updatedPostgres.postgresId,
				resourceName: updatedPostgres.appName,
			});
			return updatedPostgres;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildPostgres)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.postgresId, {
				deployment: ["create"],
			});

			await rebuildDatabase(input.postgresId, "postgres");

			await audit(ctx, {
				action: "rebuild",
				resourceType: "service",
				resourceId: input.postgresId,
			});
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
			const { accessedServices } = await findMemberByUserId(
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
