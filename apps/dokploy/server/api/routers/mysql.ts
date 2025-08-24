import {
	addNewService,
	checkServiceAccess,
	createMount,
	createMysql,
	deployMySql,
	findBackupsByDbId,
	findMySqlById,
	findProjectById,
	IS_CLOUD,
	rebuildDatabase,
	removeMySqlById,
	removeService,
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
	apiUpdateMySql,
	mysql as mysqlTable,
} from "@/server/db/schema";
import { cancelJobs } from "@/server/utils/backup";

export const mysqlRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMySql)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.role === "member") {
					await checkServiceAccess(
						ctx.user.id,
						input.projectId,
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
				1;
				const project = await findProjectById(input.projectId);
				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}

				const newMysql = await createMysql(input);
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

				return true;
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
			if (mysql.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (service.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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
			const mongo = await findMySqlById(input.mysqlId);
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this external port",
				});
			}
			await updateMySqlById(input.mysqlId, {
				externalPort: input.externalPort,
			});
			await deployMySql(input.mysqlId);
			return mongo;
		}),
	deploy: protectedProcedure
		.input(apiDeployMySql)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			if (mysql.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mysql.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mysql.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mongo.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mysql.project.organizationId !== ctx.session.activeOrganizationId) {
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
			if (mysql.project.organizationId !== ctx.session.activeOrganizationId) {
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
				targetProjectId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const mysql = await findMySqlById(input.mysqlId);
			if (mysql.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move this mysql",
				});
			}

			const targetProject = await findProjectById(input.targetProjectId);
			if (targetProject.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to move to this project",
				});
			}

			// Update the mysql's projectId
			const updatedMysql = await db
				.update(mysqlTable)
				.set({
					projectId: input.targetProjectId,
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
			if (mysql.project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to rebuild this MySQL database",
				});
			}

			await rebuildDatabase(mysql.mysqlId, "mysql");

			return true;
		}),
});
