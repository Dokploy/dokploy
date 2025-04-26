import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateProject,
	apiFindOneProject,
	apiRemoveProject,
	apiUpdateProject,
	applications,
	compose,
	mariadb,
	mongo,
	mysql,
	postgres,
	projects,
	redis,
} from "@/server/db/schema";
import { z } from "zod";

import {
	IS_CLOUD,
	addNewProject,
	checkProjectAccess,
	createApplication,
	createCompose,
	createMariadb,
	createMongo,
	createMysql,
	createPostgres,
	createProject,
	createRedis,
	deleteProject,
	findApplicationById,
	findComposeById,
	findMongoById,
	findMemberById,
	findRedisById,
	findProjectById,
	findUserById,
	updateProjectById,
	findPostgresById,
	findMariadbById,
	findMySqlById,
	createDomain,
	createPort,
	createMount,
	createRedirect,
	createPreviewDeployment,
	createBackup,
	createSecurity,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const projectRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateProject)
		.mutation(async ({ ctx, input }) => {
			try {
				if (ctx.user.rol === "member") {
					await checkProjectAccess(
						ctx.user.id,
						"create",
						ctx.session.activeOrganizationId,
					);
				}

				const admin = await findUserById(ctx.user.ownerId);

				if (admin.serversQuantity === 0 && IS_CLOUD) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No servers available, Please subscribe to a plan",
					});
				}

				const project = await createProject(
					input,
					ctx.session.activeOrganizationId,
				);
				if (ctx.user.rol === "member") {
					await addNewProject(
						ctx.user.id,
						project.projectId,
						ctx.session.activeOrganizationId,
					);
				}

				return project;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error creating the project: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),

	one: protectedProcedure
		.input(apiFindOneProject)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "member") {
				const { accessedServices } = await findMemberById(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);

				await checkProjectAccess(
					ctx.user.id,
					"access",
					ctx.session.activeOrganizationId,
					input.projectId,
				);

				const project = await db.query.projects.findFirst({
					where: and(
						eq(projects.projectId, input.projectId),
						eq(projects.organizationId, ctx.session.activeOrganizationId),
					),
					with: {
						compose: {
							where: buildServiceFilter(compose.composeId, accessedServices),
						},
						applications: {
							where: buildServiceFilter(
								applications.applicationId,
								accessedServices,
							),
						},
						mariadb: {
							where: buildServiceFilter(mariadb.mariadbId, accessedServices),
						},
						mongo: {
							where: buildServiceFilter(mongo.mongoId, accessedServices),
						},
						mysql: {
							where: buildServiceFilter(mysql.mysqlId, accessedServices),
						},
						postgres: {
							where: buildServiceFilter(postgres.postgresId, accessedServices),
						},
						redis: {
							where: buildServiceFilter(redis.redisId, accessedServices),
						},
					},
				});

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Project not found",
					});
				}
				return project;
			}
			const project = await findProjectById(input.projectId);

			if (project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this project",
				});
			}
			return project;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		// console.log(ctx.user);
		if (ctx.user.rol === "member") {
			const { accessedProjects, accessedServices } = await findMemberById(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);

			if (accessedProjects.length === 0) {
				return [];
			}

			const query = await db.query.projects.findMany({
				where: and(
					sql`${projects.projectId} IN (${sql.join(
						accessedProjects.map((projectId) => sql`${projectId}`),
						sql`, `,
					)})`,
					eq(projects.organizationId, ctx.session.activeOrganizationId),
				),
				with: {
					applications: {
						where: buildServiceFilter(
							applications.applicationId,
							accessedServices,
						),
						with: { domains: true },
					},
					mariadb: {
						where: buildServiceFilter(mariadb.mariadbId, accessedServices),
					},
					mongo: {
						where: buildServiceFilter(mongo.mongoId, accessedServices),
					},
					mysql: {
						where: buildServiceFilter(mysql.mysqlId, accessedServices),
					},
					postgres: {
						where: buildServiceFilter(postgres.postgresId, accessedServices),
					},
					redis: {
						where: buildServiceFilter(redis.redisId, accessedServices),
					},
					compose: {
						where: buildServiceFilter(compose.composeId, accessedServices),
						with: { domains: true },
					},
				},
				orderBy: desc(projects.createdAt),
			});

			return query;
		}

		return await db.query.projects.findMany({
			with: {
				applications: {
					with: {
						domains: true,
					},
				},
				mariadb: true,
				mongo: true,
				mysql: true,
				postgres: true,
				redis: true,
				compose: {
					with: {
						domains: true,
					},
				},
			},
			where: eq(projects.organizationId, ctx.session.activeOrganizationId),
			orderBy: desc(projects.createdAt),
		});
	}),

	remove: protectedProcedure
		.input(apiRemoveProject)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "member") {
					await checkProjectAccess(
						ctx.user.id,
						"delete",
						ctx.session.activeOrganizationId,
					);
				}
				const currentProject = await findProjectById(input.projectId);
				if (
					currentProject.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to delete this project",
					});
				}
				const deletedProject = await deleteProject(input.projectId);

				return deletedProject;
			} catch (error) {
				throw error;
			}
		}),
	update: protectedProcedure
		.input(apiUpdateProject)
		.mutation(async ({ input, ctx }) => {
			try {
				const currentProject = await findProjectById(input.projectId);
				if (
					currentProject.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this project",
					});
				}
				const project = await updateProjectById(input.projectId, {
					...input,
				});

				return project;
			} catch (error) {
				throw error;
			}
		}),
	duplicate: protectedProcedure
		.input(
			z.object({
				sourceProjectId: z.string(),
				name: z.string(),
				description: z.string().optional(),
				includeServices: z.boolean().default(true),
				selectedServices: z
					.array(
						z.object({
							id: z.string(),
							type: z.enum([
								"application",
								"postgres",
								"mariadb",
								"mongo",
								"mysql",
								"redis",
								"compose",
							]),
						}),
					)
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				if (ctx.user.rol === "member") {
					await checkProjectAccess(
						ctx.user.id,
						"create",
						ctx.session.activeOrganizationId,
					);
				}

				// Get source project
				const sourceProject = await findProjectById(input.sourceProjectId);

				if (sourceProject.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}

				// Create new project
				const newProject = await createProject(
					{
						name: input.name,
						description: input.description,
						env: sourceProject.env,
					},
					ctx.session.activeOrganizationId,
				);

				if (input.includeServices) {
					const servicesToDuplicate = input.selectedServices || [];

					// Helper function to duplicate a service
					const duplicateService = async (id: string, type: string) => {
						switch (type) {
							case "application": {
								const {
									applicationId,
									domains,
									security,
									ports,
									registry,
									redirects,
									previewDeployments,
									mounts,
									...application
								} = await findApplicationById(id);

								const newApplication = await createApplication({
									...application,
									projectId: newProject.projectId,
								});

								for (const domain of domains) {
									const { domainId, ...rest } = domain;
									await createDomain({
										...rest,
										applicationId: newApplication.applicationId,
										domainType: "application",
									});
								}

								for (const port of ports) {
									const { portId, ...rest } = port;
									await createPort({
										...rest,
										applicationId: newApplication.applicationId,
									});
								}

								for (const mount of mounts) {
									const { mountId, ...rest } = mount;
									await createMount({
										...rest,
										serviceId: newApplication.applicationId,
										serviceType: "application",
									});
								}

								for (const redirect of redirects) {
									const { redirectId, ...rest } = redirect;
									await createRedirect({
										...rest,
										applicationId: newApplication.applicationId,
									});
								}

								for (const secure of security) {
									const { securityId, ...rest } = secure;
									await createSecurity({
										...rest,
										applicationId: newApplication.applicationId,
									});
								}

								for (const previewDeployment of previewDeployments) {
									const { previewDeploymentId, ...rest } = previewDeployment;
									await createPreviewDeployment({
										...rest,
										applicationId: newApplication.applicationId,
									});
								}

								break;
							}
							case "postgres": {
								const { postgresId, mounts, backups, ...postgres } =
									await findPostgresById(id);

								const newPostgres = await createPostgres({
									...postgres,
									projectId: newProject.projectId,
								});

								for (const mount of mounts) {
									const { mountId, ...rest } = mount;
									await createMount({
										...rest,
										serviceId: newPostgres.postgresId,
										serviceType: "postgres",
									});
								}

								for (const backup of backups) {
									const { backupId, ...rest } = backup;
									await createBackup({
										...rest,
										postgresId: newPostgres.postgresId,
									});
								}
								break;
							}
							case "mariadb": {
								const { mariadbId, mounts, backups, ...mariadb } =
									await findMariadbById(id);
								const newMariadb = await createMariadb({
									...mariadb,
									projectId: newProject.projectId,
								});

								for (const mount of mounts) {
									const { mountId, ...rest } = mount;
									await createMount({
										...rest,
										serviceId: newMariadb.mariadbId,
										serviceType: "mariadb",
									});
								}

								for (const backup of backups) {
									const { backupId, ...rest } = backup;
									await createBackup({
										...rest,
										mariadbId: newMariadb.mariadbId,
									});
								}
								break;
							}
							case "mongo": {
								const { mongoId, mounts, backups, ...mongo } =
									await findMongoById(id);
								const newMongo = await createMongo({
									...mongo,
									projectId: newProject.projectId,
								});

								for (const mount of mounts) {
									const { mountId, ...rest } = mount;
									await createMount({
										...rest,
										serviceId: newMongo.mongoId,
										serviceType: "mongo",
									});
								}

								for (const backup of backups) {
									const { backupId, ...rest } = backup;
									await createBackup({
										...rest,
										mongoId: newMongo.mongoId,
									});
								}
								break;
							}
							case "mysql": {
								const { mysqlId, mounts, backups, ...mysql } =
									await findMySqlById(id);
								const newMysql = await createMysql({
									...mysql,
									projectId: newProject.projectId,
								});

								for (const mount of mounts) {
									const { mountId, ...rest } = mount;
									await createMount({
										...rest,
										serviceId: newMysql.mysqlId,
										serviceType: "mysql",
									});
								}

								for (const backup of backups) {
									const { backupId, ...rest } = backup;
									await createBackup({
										...rest,
										mysqlId: newMysql.mysqlId,
									});
								}
								break;
							}
							case "redis": {
								const { redisId, mounts, ...redis } = await findRedisById(id);
								const newRedis = await createRedis({
									...redis,
									projectId: newProject.projectId,
								});

								for (const mount of mounts) {
									const { mountId, ...rest } = mount;
									await createMount({
										...rest,
										serviceId: newRedis.redisId,
										serviceType: "redis",
									});
								}

								break;
							}
							case "compose": {
								const { composeId, mounts, domains, ...compose } =
									await findComposeById(id);
								const newCompose = await createCompose({
									...compose,
									projectId: newProject.projectId,
								});

								for (const mount of mounts) {
									const { mountId, ...rest } = mount;
									await createMount({
										...rest,
										serviceId: newCompose.composeId,
										serviceType: "compose",
									});
								}

								for (const domain of domains) {
									const { domainId, ...rest } = domain;
									await createDomain({
										...rest,
										composeId: newCompose.composeId,
										domainType: "compose",
									});
								}

								break;
							}
						}
					};

					// Duplicate selected services

					for (const service of servicesToDuplicate) {
						await duplicateService(service.id, service.type);
					}
				}

				if (ctx.user.rol === "member") {
					await addNewProject(
						ctx.user.id,
						newProject.projectId,
						ctx.session.activeOrganizationId,
					);
				}

				return newProject;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error duplicating the project: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),
});

function buildServiceFilter(
	fieldName: AnyPgColumn,
	accessedServices: string[],
) {
	return accessedServices.length > 0
		? sql`${fieldName} IN (${sql.join(
				accessedServices.map((serviceId) => sql`${serviceId}`),
				sql`, `,
			)})`
		: sql`1 = 0`;
}
