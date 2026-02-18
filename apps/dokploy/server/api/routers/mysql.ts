import {
	addNewService,
	checkPortInUse,
	checkServiceAccess,
	createMount,
	createMysql,
	deployMySql,
	executeTransfer,
	findBackupsByDbId,
	findEnvironmentById,
	findMySqlById,
	findProjectById,
	IS_CLOUD,
	rebuildDatabase,
	removeMySqlById,
	removeService,
	scanServiceForTransfer,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateMySqlById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiChangeMySqlStatus,
	apiCreateMySql,
	apiDeployMySql,
	apiFindOneMySql,
	apiRebuildMysql,
	apiResetMysql,
	apiSaveEnvironmentVariablesMySql,
	apiSaveExternalPortMySql,
	apiTransferMySql,
	apiUpdateMySql,
	mysql as mysqlTable,
} from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";
import {
	runTransferWithDowntime,
	startSourceDockerService,
	stopSourceDockerService,
	validateTransferTargetServer,
} from "@/server/utils/transfer";

export const mysqlRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMySql)
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
						message: "You need to use a server to create a MySQL",
					});
				}

				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}

				const newMysql = await createMysql({
					...input,
				});
				if (ctx.user.role === "member") {
					await addNewService(
						ctx.user.id,
						newMysql.mysqlId,
						project.organizationId,
					);
				}

				await createMount({
					serviceId: newMysql.mysqlId,
					serviceType: "mysql",
					volumeName: `${newMysql.appName}-data`,
					mountPath: "/var/lib/mysql",
					type: "volume",
				});

				return newMysql;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting MySQL database",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneMySql)
		.query(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.mysqlId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this MySQL",
				});
			}
			return mysql;
		}),

	start: protectedProcedure
		.input(apiFindOneMySql)
		.mutation(async ({ input, ctx }) => {
			const service = await findMySqlById(input.mysqlId);
			if (
				service.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this MySQL",
				});
			}

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "done",
			});

			return service;
		}),
	stop: protectedProcedure
		.input(apiFindOneMySql)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMySqlById(input.mysqlId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to stop this MySQL",
				});
			}
			if (mongo.serverId) {
				await stopServiceRemote(mongo.serverId, mongo.appName);
			} else {
				await stopService(mongo.appName);
			}
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "idle",
			});

			return mongo;
		}),
	saveExternalPort: protectedProcedure
		.input(apiSaveExternalPortMySql)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
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
					mysql.serverId || undefined,
				);
				if (portCheck.isInUse) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port ${input.externalPort} is already in use by ${portCheck.conflictingContainer}`,
					});
				}
			}

			await updateMySqlById(input.mysqlId, {
				externalPort: input.externalPort,
			});
			await deployMySql(input.mysqlId);
			return mysql;
		}),
	deploy: protectedProcedure
		.input(apiDeployMySql)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this MySQL",
				});
			}
			return deployMySql(input.mysqlId);
		}),
	deployWithLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/deploy/mysql-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiDeployMySql)
		.subscription(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this MySQL",
				});
			}

			return observable<string>((emit) => {
				deployMySql(input.mysqlId, (log) => {
					emit.next(log);
				});
			});
		}),
	changeStatus: protectedProcedure
		.input(apiChangeMySqlStatus)
		.mutation(async ({ input, ctx }) => {
			const mongo = await findMySqlById(input.mysqlId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to change this MySQL status",
				});
			}
			await updateMySqlById(input.mysqlId, {
				applicationStatus: input.applicationStatus,
			});
			return mongo;
		}),
	reload: protectedProcedure
		.input(apiResetMysql)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this MySQL",
				});
			}
			if (mysql.serverId) {
				await stopServiceRemote(mysql.serverId, mysql.appName);
			} else {
				await stopService(mysql.appName);
			}
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "idle",
			});
			if (mysql.serverId) {
				await startServiceRemote(mysql.serverId, mysql.appName);
			} else {
				await startService(mysql.appName);
			}
			await updateMySqlById(input.mysqlId, {
				applicationStatus: "done",
			});
			return true;
		}),
	remove: protectedProcedure
		.input(apiFindOneMySql)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.mysqlId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}
			const mongo = await findMySqlById(input.mysqlId);
			if (
				mongo.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this MySQL",
				});
			}

			const backups = await findBackupsByDbId(input.mysqlId, "mysql");
			const cleanupOperations = [
				async () => await removeService(mongo?.appName, mongo.serverId),
				async () => await cancelJobs(backups),
				async () => await removeMySqlById(input.mysqlId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			return mongo;
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariablesMySql)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			const service = await updateMySqlById(input.mysqlId, {
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
	update: protectedProcedure
		.input(apiUpdateMySql)
		.mutation(async ({ input, ctx }) => {
			const { mysqlId, ...rest } = input;
			const mysql = await findMySqlById(mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this MySQL",
				});
			}
			const service = await updateMySqlById(mysqlId, {
				...rest,
			});

			if (!service) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error updating MySQL",
				});
			}

			return true;
		}),
	move: protectedProcedure
		.input(
			z.object({
				mysqlId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this mysql",
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

			// Update the mysql's projectId
			const updatedMysql = await db
				.update(mysqlTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(mysqlTable.mysqlId, input.mysqlId))
				.returning()
				.then((res) => res[0]);

			if (!updatedMysql) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move mysql",
				});
			}

			return updatedMysql;
		}),
	rebuild: protectedProcedure
		.input(apiRebuildMysql)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to rebuild this MySQL database",
				});
			}

			await rebuildDatabase(mysql.mysqlId, "mysql");

			return true;
		}),

	// Scan mysql for transfer — pre-flight check
	transferScan: protectedProcedure
		.input(apiTransferMySql)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);

			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to transfer this MySQL",
				});
			}

			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.mysqlId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}

			const targetServerId = await validateTransferTargetServer({
				targetServerId: input.targetServerId,
				sourceServerId: mysql.serverId,
				organizationId: ctx.session.activeOrganizationId,
			});

			return scanServiceForTransfer({
				serviceId: input.mysqlId,
				serviceType: "mysql",
				appName: mysql.appName,
				sourceServerId: mysql.serverId,
				targetServerId,
			});
		}),

	// Transfer mysql to a different server (node)
	transfer: protectedProcedure
		.input(
			apiTransferMySql.extend({
				decisions: z.record(z.enum(["skip", "overwrite"])).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);

			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to transfer this MySQL",
				});
			}

			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.mysqlId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}

			const targetServerId = await validateTransferTargetServer({
				targetServerId: input.targetServerId,
				sourceServerId: mysql.serverId,
				organizationId: ctx.session.activeOrganizationId,
			});

			const result = await runTransferWithDowntime({
				stopSource: async () => {
					await stopSourceDockerService(mysql.serverId, mysql.appName);
				},
				startSource: async () => {
					await startSourceDockerService(mysql.serverId, mysql.appName);
				},
				executeTransfer: async () =>
					executeTransfer(
						{
							serviceId: input.mysqlId,
							serviceType: "mysql",
							appName: mysql.appName,
							sourceServerId: mysql.serverId,
							targetServerId,
						},
						input.decisions || {},
						(_progress) => {},
					),
				commitTransfer: async () => {
					await db
						.update(mysqlTable)
						.set({ serverId: targetServerId })
						.where(eq(mysqlTable.mysqlId, input.mysqlId));
				},
			});

			if (!result.success) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Transfer failed: ${result.errors.join(", ")}`,
				});
			}

			return { success: true };
		}),

	transferWithLogs: protectedProcedure
		.input(
			apiTransferMySql.extend({
				decisions: z.record(z.enum(["skip", "overwrite"])).optional(),
			}),
		)
		.subscription(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);

			if (
				mysql.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to transfer this MySQL",
				});
			}

			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.mysqlId,
					ctx.session.activeOrganizationId,
					"delete",
				);
			}

			const targetServerId = await validateTransferTargetServer({
				targetServerId: input.targetServerId,
				sourceServerId: mysql.serverId,
				organizationId: ctx.session.activeOrganizationId,
			});

			return observable<string>((emit) => {
				runTransferWithDowntime({
					stopSource: async () => {
						await stopSourceDockerService(mysql.serverId, mysql.appName);
					},
					startSource: async () => {
						await startSourceDockerService(mysql.serverId, mysql.appName);
					},
					executeTransfer: async () =>
						executeTransfer(
							{
								serviceId: input.mysqlId,
								serviceType: "mysql",
								appName: mysql.appName,
								sourceServerId: mysql.serverId,
								targetServerId,
							},
							input.decisions || {},
							(progress) => {
								emit.next(JSON.stringify(progress));
							},
						),
					commitTransfer: async () => {
						await db
							.update(mysqlTable)
							.set({ serverId: targetServerId })
							.where(eq(mysqlTable.mysqlId, input.mysqlId));
					},
				})
					.then((result) => {
						if (result.success) {
							emit.next("Transfer completed successfully!");
						} else {
							const errorMessage = result.errors.join(", ") || "Unknown error";
							emit.next(`Transfer failed: ${errorMessage}`);
						}
						emit.complete();
					})
					.catch((error) => {
						const message =
							error instanceof Error ? error.message : "Unknown transfer error";
						emit.next(`Transfer failed: ${message}`);
						emit.complete();
					});
			});
		}),
});
