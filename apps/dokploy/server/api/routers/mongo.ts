import {
	checkPortInUse,
	createMongo,
	createMount,
	deployMongo,
	execAsync,
	execAsyncRemote,
	findBackupsByDbId,
	findEnvironmentById,
	findMongoById,
	findProjectById,
	getAccessibleServerIds,
	getContainerLogs,
	getServiceContainerCommand,
	IS_CLOUD,
	rebuildDatabase,
	removeMongoById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateMongoById,
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
	apiChangeMongoStatus,
	apiCreateMongo,
	apiDeployMongo,
	apiFindOneMongo,
	apiRebuildMongo,
	apiResetMongo,
	apiSaveEnvironmentVariablesMongo,
	apiSaveExternalPortMongo,
	apiUpdateMongo,
	DATABASE_PASSWORD_MESSAGE,
	DATABASE_PASSWORD_REGEX,
	environments,
	mongo as mongoTable,
	projects,
} from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";
export const mongoRouter = createTRPCRouter({
	create: protectedProcedure
		.meta({
			openapi: {
				summary: "Create a MongoDB database",
				description: "Creates a new MongoDB database service with the specified configuration, sets up a persistent data volume, and registers it in the project.",
			},
		})
		.input(apiCreateMongo)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a mongo",
					});
				}

				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}

				if (input.serverId) {
					const accessibleIds = await getAccessibleServerIds(ctx.session);
					if (!accessibleIds.has(input.serverId)) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You are not authorized to access this server",
						});
					}
				}

				const newMongo = await createMongo({
					...input,
				});
				await addNewService(ctx, newMongo.mongoId);

				await createMount({
					serviceId: newMongo.mongoId,
					serviceType: "mongo",
					volumeName: `${newMongo.appName}-data`,
					mountPath: "/data/db",
					type: "volume",
				});

				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newMongo.mongoId,
					resourceName: newMongo.appName,
				});
				return newMongo;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting mongo database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get a MongoDB database by ID",
				description: "Returns the full details of a MongoDB database service, including its environment and project configuration.",
			},
		})
		.input(apiFindOneMongo)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.mongoId, "read");

			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this mongo",
				});
			}
			return mongo;
		}),

	start: protectedProcedure
		.meta({
			openapi: {
				summary: "Start a MongoDB database",
				description: "Starts the Docker container for the specified MongoDB database and sets its status to done.",
			},
		})
		.input(apiFindOneMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const service = await findMongoById(input.mongoId);

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "done",
			});

			await audit(ctx, {
				action: "start",
				resourceType: "service",
				resourceId: service.mongoId,
				resourceName: service.appName,
			});
			return service;
		}),
	stop: protectedProcedure
		.meta({
			openapi: {
				summary: "Stop a MongoDB database",
				description: "Stops the Docker container for the specified MongoDB database and sets its status to idle.",
			},
		})
		.input(apiFindOneMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);

			if (mongo.serverId) {
				await stopServiceRemote(mongo.serverId, mongo.appName);
			} else {
				await stopService(mongo.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "idle",
			});

			await audit(ctx, {
				action: "stop",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	saveExternalPort: protectedProcedure
		.meta({
			openapi: {
				summary: "Save the external port for a MongoDB database",
				description: "Updates the external port mapping for the MongoDB database and triggers a redeployment. Validates that the port is not already in use.",
			},
		})
		.input(apiSaveExternalPortMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				service: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);

			if (input.externalPort) {
				const portCheck = await checkPortInUse(
					input.externalPort,
					mongo.serverId || undefined,
				);
				if (portCheck.isInUse) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port ${input.externalPort} is already in use by ${portCheck.conflictingContainer}`,
					});
				}
			}

			await updateMongoById(input.mongoId, {
				externalPort: input.externalPort,
			});
			await deployMongo(input.mongoId);
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	deploy: protectedProcedure
		.meta({
			openapi: {
				summary: "Deploy a MongoDB database",
				description: "Triggers a deployment for the specified MongoDB database, rebuilding and restarting its Docker container with the current configuration.",
			},
		})
		.input(apiDeployMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);
			await audit(ctx, {
				action: "deploy",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return deployMongo(input.mongoId);
		}),
	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/mongo-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployMongo)
		.subscription(async function* ({ input, ctx, signal }) {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const queue: string[] = [];
			let done = false;

			deployMongo(input.mongoId, (log) => {
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
		.meta({
			openapi: {
				summary: "Change MongoDB database status",
				description: "Updates the application status of a MongoDB database without starting or stopping the container.",
			},
		})
		.input(apiChangeMongoStatus)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);
			await updateMongoById(input.mongoId, {
				applicationStatus: input.applicationStatus,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return mongo;
		}),
	reload: protectedProcedure
		.meta({
			openapi: {
				summary: "Reload a MongoDB database",
				description: "Restarts the MongoDB database by stopping and then starting its Docker container.",
			},
		})
		.input(apiResetMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});
			const mongo = await findMongoById(input.mongoId);
			if (mongo.serverId) {
				await stopServiceRemote(mongo.serverId, mongo.appName);
			} else {
				await stopService(mongo.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "idle",
			});

			if (mongo.serverId) {
				await startServiceRemote(mongo.serverId, mongo.appName);
			} else {
				await startService(mongo.appName);
			}
			await updateMongoById(input.mongoId, {
				applicationStatus: "done",
			});
			await audit(ctx, {
				action: "reload",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			return true;
		}),
	remove: protectedProcedure
		.meta({
			openapi: {
				summary: "Delete a MongoDB database",
				description: "Removes the MongoDB database service, its Docker container, cancels associated backup jobs, and deletes the database record.",
			},
		})
		.input(apiFindOneMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.mongoId, "delete");

			const mongo = await findMongoById(input.mongoId);

			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this mongo",
				});
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: mongo.mongoId,
				resourceName: mongo.appName,
			});
			const backups = await findBackupsByDbId(input.mongoId, "mongo");

			const cleanupOperations = [
				async () => await removeService(mongo?.appName, mongo.serverId),
				async () => await cancelJobs(backups),
				async () => await removeMongoById(input.mongoId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return mongo;
		}),
	saveEnvironment: protectedProcedure
		.meta({
			openapi: {
				summary: "Save environment variables for a MongoDB database",
				description: "Updates the environment variables for the specified MongoDB database service.",
			},
		})
		.input(apiSaveEnvironmentVariablesMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				envVars: ["write"],
			});
			const service = await updateMongoById(input.mongoId, {
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
				resourceId: input.mongoId,
			});
			return true;
		}),
	update: protectedProcedure
		.meta({
			openapi: {
				summary: "Update a MongoDB database",
				description: "Updates the configuration of an existing MongoDB database service.",
			},
		})
		.input(apiUpdateMongo)
		.mutation(async ({ input, ctx }) => {
			const { mongoId, ...rest } = input;
			await checkServicePermissionAndAccess(ctx, mongoId, {
				service: ["create"],
			});
			const service = await updateMongoById(mongoId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error updating Mongo",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongoId,
				resourceName: service.appName,
			});
			return true;
		}),
	changePassword: protectedProcedure
		.meta({
			openapi: {
				summary: "Change MongoDB database password",
				description: "Changes the password for the MongoDB database user by executing changeUserPassword via mongosh inside the running container and updating the stored password.",
			},
		})
		.input(
			z.object({
				mongoId: z.string().min(1),
				password: z.string().min(1).regex(DATABASE_PASSWORD_REGEX, {
					message: DATABASE_PASSWORD_MESSAGE,
				}),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { mongoId, password } = input;
			await checkServicePermissionAndAccess(ctx, mongoId, {
				service: ["create"],
			});

			const mongo = await findMongoById(mongoId);
			const { appName, serverId, databaseUser, databasePassword } = mongo;

			const containerCmd = getServiceContainerCommand(appName);
			const command = `
				CONTAINER_ID=$(${containerCmd})
				if [ -z "$CONTAINER_ID" ]; then
					echo "No running container found for ${appName}" >&2
					exit 1
				fi
				docker exec "$CONTAINER_ID" mongosh -u '${databaseUser}' -p '${databasePassword}' --authenticationDatabase admin --eval "db.getSiblingDB('admin').changeUserPassword('${databaseUser}', '${password}')"
			`;

			await db.transaction(async (tx) => {
				await tx
					.update(mongoTable)
					.set({ databasePassword: password })
					.where(eq(mongoTable.mongoId, mongoId));

				if (serverId) {
					await execAsyncRemote(serverId, command);
				} else {
					await execAsync(command, { shell: "/bin/bash" });
				}
			});

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: mongoId,
				resourceName: appName,
			});

			return true;
		}),
	move: protectedProcedure
		.meta({
			openapi: {
				summary: "Move a MongoDB database to another environment",
				description: "Moves the MongoDB database to a different environment within the same project.",
			},
		})
		.input(
			z.object({
				mongoId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				service: ["create"],
			});

			const updatedMongo = await db
				.update(mongoTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(mongoTable.mongoId, input.mongoId))
				.returning()
				.then((res) => res[0]);

			if (!updatedMongo) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move mongo",
				});
			}

			await audit(ctx, {
				action: "move",
				resourceType: "service",
				resourceId: updatedMongo.mongoId,
				resourceName: updatedMongo.appName,
			});
			return updatedMongo;
		}),
	rebuild: protectedProcedure
		.meta({
			openapi: {
				summary: "Rebuild a MongoDB database",
				description: "Rebuilds the MongoDB database Docker container from scratch, pulling the latest image and recreating the service.",
			},
		})
		.input(apiRebuildMongo)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.mongoId, {
				deployment: ["create"],
			});

			await rebuildDatabase(input.mongoId, "mongo");

			await audit(ctx, {
				action: "rebuild",
				resourceType: "service",
				resourceId: input.mongoId,
			});
			return true;
		}),
	search: protectedProcedure
		.meta({
			openapi: {
				summary: "Search MongoDB databases",
				description: "Returns a paginated list of MongoDB databases matching the given filters. Supports searching by name, appName, description, project, and environment.",
			},
		})
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
				baseConditions.push(eq(mongoTable.environmentId, input.environmentId));
			}
			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(mongoTable.name, term),
						ilike(mongoTable.appName, term),
						ilike(mongoTable.description ?? "", term),
					)!,
				);
			}
			if (input.name?.trim()) {
				baseConditions.push(ilike(mongoTable.name, `%${input.name.trim()}%`));
			}
			if (input.appName?.trim()) {
				baseConditions.push(
					ilike(mongoTable.appName, `%${input.appName.trim()}%`),
				);
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(mongoTable.description ?? "", `%${input.description.trim()}%`),
				);
			}
			const { accessedServices } = await findMemberByUserId(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			if (accessedServices.length === 0) return { items: [], total: 0 };
			baseConditions.push(
				sql`${mongoTable.mongoId} IN (${sql.join(
					accessedServices.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

			const where = and(...baseConditions);
			const [items, countResult] = await Promise.all([
				db
					.select({
						mongoId: mongoTable.mongoId,
						name: mongoTable.name,
						appName: mongoTable.appName,
						description: mongoTable.description,
						environmentId: mongoTable.environmentId,
						applicationStatus: mongoTable.applicationStatus,
						createdAt: mongoTable.createdAt,
					})
					.from(mongoTable)
					.innerJoin(
						environments,
						eq(mongoTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(mongoTable.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(mongoTable)
					.innerJoin(
						environments,
						eq(mongoTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where),
			]);
			return { items, total: countResult[0]?.count ?? 0 };
		}),

	readLogs: protectedProcedure
		.meta({
			openapi: {
				summary: "Read MongoDB container logs",
				description: "Retrieves the Docker container logs for the specified MongoDB database, with support for tail count, time-based filtering, and text search.",
			},
		})
		.input(
			apiFindOneMongo.extend({
				tail: z.number().int().min(1).max(10000).default(100),
				since: z
					.string()
					.regex(/^(all|\d+[smhd])$/, "Invalid since format")
					.default("all"),
				search: z
					.string()
					.regex(/^[a-zA-Z0-9 ._-]{0,500}$/)
					.optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.mongoId, "read");
			const mongo = await findMongoById(input.mongoId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this MongoDB",
				});
			}
			return await getContainerLogs(
				mongo.appName,
				input.tail,
				input.since,
				input.search,
				mongo.serverId,
			);
		}),
});
