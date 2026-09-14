import {
	checkPortInUse,
	createMount,
	createObjectStorage,
	deployObjectStorage,
	findEnvironmentById,
	findObjectStorageById,
	findProjectById,
	getAccessibleServerIds,
	getContainerLogs,
	getObjectStorageMountPath,
	getWebServerSettings,
	IS_CLOUD,
	rebuildDatabase,
	removeObjectStorageById,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateObjectStorageById,
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
	apiChangeObjectStorageStatus,
	apiCreateObjectStorage,
	apiDeployObjectStorage,
	apiFindObjectStorage,
	apiRebuildObjectStorage,
	apiResetObjectStorage,
	apiSaveEnvironmentVariablesObjectStorage,
	apiSaveExternalPortObjectStorage,
	apiUpdateObjectStorage,
	environments,
	objectstorage as objectstorageTable,
	projects,
} from "@/server/db/schema";

export const objectstorageRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateObjectStorage)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

				const webServerSettings = await getWebServerSettings();
				if (
					(IS_CLOUD || webServerSettings?.remoteServersOnly) &&
					!input.serverId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create an Object Storage",
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

				const newObjectStorage = await createObjectStorage({
					...input,
				});
				await addNewService(ctx, newObjectStorage.objectStorageId);

				const mountPath = getObjectStorageMountPath(input.provider ?? "minio");

				await createMount({
					serviceId: newObjectStorage.objectStorageId,
					serviceType: "objectstorage",
					volumeName: `${newObjectStorage.appName}-data`,
					mountPath: mountPath,
					type: "volume",
				});

				if (input.provider === "garage") {
					await createMount({
						serviceId: newObjectStorage.objectStorageId,
						serviceType: "objectstorage",
						volumeName: `${newObjectStorage.appName}-meta`,
						mountPath: "/var/lib/garage/meta",
						type: "volume",
					});
				}

				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newObjectStorage.objectStorageId,
					resourceName: newObjectStorage.appName,
				});
				return newObjectStorage;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting Object Storage",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindObjectStorage)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.objectStorageId, "read");

			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}
			return objectStorage;
		}),

	start: protectedProcedure
		.input(apiFindObjectStorage)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				deployment: ["create"],
			});
			const service = await findObjectStorageById(input.objectStorageId);

			if (
				service.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateObjectStorageById(input.objectStorageId, {
				applicationStatus: "done",
			});

			await audit(ctx, {
				action: "start",
				resourceType: "service",
				resourceId: service.objectStorageId,
				resourceName: service.appName,
			});
			return service;
		}),
	stop: protectedProcedure
		.input(apiFindObjectStorage)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				deployment: ["create"],
			});
			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}
			if (objectStorage.serverId) {
				await stopServiceRemote(objectStorage.serverId, objectStorage.appName);
			} else {
				await stopService(objectStorage.appName);
			}
			await updateObjectStorageById(input.objectStorageId, {
				applicationStatus: "idle",
			});

			await audit(ctx, {
				action: "stop",
				resourceType: "service",
				resourceId: objectStorage.objectStorageId,
				resourceName: objectStorage.appName,
			});
			return objectStorage;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortObjectStorage)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				service: ["create"],
			});
			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}

			if (input.externalPort) {
				const portCheck = await checkPortInUse(
					input.externalPort,
					objectStorage.serverId || undefined,
				);
				if (portCheck.isInUse) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port ${input.externalPort} is already in use by ${portCheck.conflictingContainer}`,
					});
				}
			}

			await updateObjectStorageById(input.objectStorageId, {
				externalPort: input.externalPort,
				consolePort: input.consolePort,
			});
			await deployObjectStorage(input.objectStorageId);
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: objectStorage.objectStorageId,
				resourceName: objectStorage.appName,
			});
			return objectStorage;
		}),
	deploy: protectedProcedure
		.input(apiDeployObjectStorage)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				deployment: ["create"],
			});
			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}
			await audit(ctx, {
				action: "deploy",
				resourceType: "service",
				resourceId: objectStorage.objectStorageId,
				resourceName: objectStorage.appName,
			});
			return deployObjectStorage(input.objectStorageId);
		}),

	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/objectstorage-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployObjectStorage)
		.subscription(async function* ({ input, ctx, signal }) {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				deployment: ["create"],
			});

			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}

			const queue: string[] = [];
			let done = false;

			deployObjectStorage(input.objectStorageId, (log) => {
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
		.input(apiChangeObjectStorageStatus)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				deployment: ["create"],
			});
			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}
			await updateObjectStorageById(input.objectStorageId, {
				applicationStatus: input.applicationStatus,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: objectStorage.objectStorageId,
				resourceName: objectStorage.appName,
			});
			return objectStorage;
		}),
	remove: protectedProcedure
		.input(apiFindObjectStorage)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.objectStorageId, "delete");
			const objectStorage = await findObjectStorageById(input.objectStorageId);

			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this Object Storage",
				});
			}

			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: objectStorage.objectStorageId,
				resourceName: objectStorage.appName,
			});

			const cleanupOperations = [
				async () =>
					await removeService(objectStorage?.appName, objectStorage.serverId),
				async () => await removeObjectStorageById(input.objectStorageId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return objectStorage;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesObjectStorage)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				envVars: ["write"],
			});
			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}
			const service = await updateObjectStorageById(input.objectStorageId, {
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
				resourceId: input.objectStorageId,
			});
			return true;
		}),
	reload: protectedProcedure
		.input(apiResetObjectStorage)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				deployment: ["create"],
			});
			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}
			if (objectStorage.serverId) {
				await stopServiceRemote(objectStorage.serverId, objectStorage.appName);
			} else {
				await stopService(objectStorage.appName);
			}
			await updateObjectStorageById(input.objectStorageId, {
				applicationStatus: "idle",
			});

			if (objectStorage.serverId) {
				await startServiceRemote(objectStorage.serverId, objectStorage.appName);
			} else {
				await startService(objectStorage.appName);
			}
			await updateObjectStorageById(input.objectStorageId, {
				applicationStatus: "done",
			});
			await audit(ctx, {
				action: "reload",
				resourceType: "service",
				resourceId: objectStorage.objectStorageId,
				resourceName: objectStorage.appName,
			});
			return true;
		}),
	update: protectedProcedure
		.input(apiUpdateObjectStorage)
		.mutation(async ({ input, ctx }) => {
			const { objectStorageId, ...rest } = input;
			await checkServicePermissionAndAccess(ctx, objectStorageId, {
				service: ["create"],
			});

			const objectStorage = await findObjectStorageById(objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this Object Storage",
				});
			}

			const service = await updateObjectStorageById(objectStorageId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating Object Storage",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "service",
				resourceId: objectStorageId,
				resourceName: service.appName,
			});
			return true;
		}),
	move: protectedProcedure
		.input(
			z.object({
				objectStorageId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				service: ["create"],
			});

			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}

			const updatedObjectStorage = await db
				.update(objectstorageTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(objectstorageTable.objectStorageId, input.objectStorageId))
				.returning()
				.then((res) => res[0]);

			if (!updatedObjectStorage) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move object storage",
				});
			}

			await audit(ctx, {
				action: "move",
				resourceType: "service",
				resourceId: updatedObjectStorage.objectStorageId,
				resourceName: updatedObjectStorage.appName,
			});
			return updatedObjectStorage;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildObjectStorage)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.objectStorageId, {
				deployment: ["create"],
			});

			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}

			await rebuildDatabase(input.objectStorageId, "objectstorage");

			await audit(ctx, {
				action: "rebuild",
				resourceType: "service",
				resourceId: input.objectStorageId,
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
					eq(objectstorageTable.environmentId, input.environmentId),
				);
			}
			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(objectstorageTable.name, term),
						ilike(objectstorageTable.appName, term),
						ilike(objectstorageTable.description ?? "", term),
					)!,
				);
			}
			if (input.name?.trim()) {
				baseConditions.push(
					ilike(objectstorageTable.name, `%${input.name.trim()}%`),
				);
			}
			if (input.appName?.trim()) {
				baseConditions.push(
					ilike(objectstorageTable.appName, `%${input.appName.trim()}%`),
				);
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(
						objectstorageTable.description ?? "",
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
				sql`${objectstorageTable.objectStorageId} IN (${sql.join(
					accessedServices.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

			const where = and(...baseConditions);
			const [items, countResult] = await Promise.all([
				db
					.select({
						objectStorageId: objectstorageTable.objectStorageId,
						name: objectstorageTable.name,
						appName: objectstorageTable.appName,
						description: objectstorageTable.description,
						environmentId: objectstorageTable.environmentId,
						applicationStatus: objectstorageTable.applicationStatus,
						createdAt: objectstorageTable.createdAt,
					})
					.from(objectstorageTable)
					.innerJoin(
						environments,
						eq(objectstorageTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(objectstorageTable.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(objectstorageTable)
					.innerJoin(
						environments,
						eq(objectstorageTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where),
			]);
			return { items, total: countResult[0]?.count ?? 0 };
		}),

	readLogs: protectedProcedure
		.input(
			apiFindObjectStorage.extend({
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
			await checkServiceAccess(ctx, input.objectStorageId, "read");
			const objectStorage = await findObjectStorageById(input.objectStorageId);
			if (
				objectStorage.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this Object Storage",
				});
			}
			return await getContainerLogs(
				objectStorage.appName,
				input.tail,
				input.since,
				input.search,
				objectStorage.serverId,
			);
		}),
});
