import {
	createApplication,
	createBackup,
	createCompose,
	createDomain,
	createLibsql,
	createMariadb,
	createMongo,
	createMount,
	createMysql,
	createPort,
	createPostgres,
	createPreviewDeployment,
	createProject,
	createRedirect,
	createRedis,
	createSecurity,
	deleteProject,
	findApplicationById,
	findComposeById,
	findEnvironmentById,
	findLibsqlById,
	findMariadbById,
	findMongoById,
	findMySqlById,
	findPostgresById,
	findProjectById,
	findRedisById,
	findUserById,
	IS_CLOUD,
	updateProjectById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	addNewEnvironment,
	addNewProject,
	checkPermission,
	checkProjectAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateProject,
	apiFindOneProject,
	apiRemoveProject,
	apiUpdateProject,
	applications,
	compose,
	environments,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	projects,
	redis,
} from "@/server/db/schema";

export const projectRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateProject)
		.mutation(async ({ ctx, input }) => {
			try {
				await checkProjectAccess(ctx, "create");

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
				await addNewProject(ctx, project.project.projectId);

				await addNewEnvironment(ctx, project?.environment?.environmentId || "");

				await audit(ctx, {
					action: "create",
					resourceType: "project",
					resourceId: project.project.projectId,
					resourceName: project.project.name,
				});
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
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				const { accessedServices, accessedProjects } = await findMemberByUserId(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);

				if (!accessedProjects.includes(input.projectId)) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this project",
					});
				}

				const project = await db.query.projects.findFirst({
					where: and(
						eq(projects.projectId, input.projectId),
						eq(projects.organizationId, ctx.session.activeOrganizationId),
					),
					with: {
						environments: {
							with: {
								applications: {
									where: buildServiceFilter(
										applications.applicationId,
										accessedServices,
									),
								},
								compose: {
									where: buildServiceFilter(
										compose.composeId,
										accessedServices,
									),
								},
								libsql: {
									where: buildServiceFilter(libsql.libsqlId, accessedServices),
								},
								mariadb: {
									where: buildServiceFilter(
										mariadb.mariadbId,
										accessedServices,
									),
								},
								mongo: {
									where: buildServiceFilter(mongo.mongoId, accessedServices),
								},
								mysql: {
									where: buildServiceFilter(mysql.mysqlId, accessedServices),
								},
								postgres: {
									where: buildServiceFilter(
										postgres.postgresId,
										accessedServices,
									),
								},
								redis: {
									where: buildServiceFilter(redis.redisId, accessedServices),
								},
							},
						},
						projectTags: {
							with: {
								tag: true,
							},
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
		if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
			const { accessedProjects, accessedEnvironments, accessedServices } =
				await findMemberByUserId(ctx.user.id, ctx.session.activeOrganizationId);

			if (accessedProjects.length === 0) {
				return [];
			}

			const environmentFilter =
				accessedEnvironments.length === 0
					? sql`false`
					: sql`${environments.environmentId} IN (${sql.join(
							accessedEnvironments.map((envId) => sql`${envId}`),
							sql`, `,
						)})`;

			return await db.query.projects.findMany({
				where: and(
					sql`${projects.projectId} IN (${sql.join(
						accessedProjects.map((projectId) => sql`${projectId}`),
						sql`, `,
					)})`,
					eq(projects.organizationId, ctx.session.activeOrganizationId),
				),
				with: {
					environments: {
						where: environmentFilter,
						with: {
							applications: {
								where: buildServiceFilter(
									applications.applicationId,
									accessedServices,
								),
								columns: {
									applicationId: true,
									name: true,
									applicationStatus: true,
								},
							},
							libsql: {
								where: buildServiceFilter(libsql.libsqlId, accessedServices),
								columns: {
									libsqlId: true,
									name: true,
									applicationStatus: true,
								},
							},
							mariadb: {
								where: buildServiceFilter(mariadb.mariadbId, accessedServices),
								columns: {
									mariadbId: true,
									name: true,
									applicationStatus: true,
								},
							},
							mongo: {
								where: buildServiceFilter(mongo.mongoId, accessedServices),
								columns: {
									mongoId: true,
									name: true,
									applicationStatus: true,
								},
							},
							mysql: {
								where: buildServiceFilter(mysql.mysqlId, accessedServices),
								columns: {
									mysqlId: true,
									name: true,
									applicationStatus: true,
								},
							},
							postgres: {
								where: buildServiceFilter(
									postgres.postgresId,
									accessedServices,
								),
								columns: {
									postgresId: true,
									name: true,
									applicationStatus: true,
								},
							},
							redis: {
								where: buildServiceFilter(redis.redisId, accessedServices),
								columns: {
									redisId: true,
									name: true,
									applicationStatus: true,
								},
							},
							compose: {
								where: buildServiceFilter(compose.composeId, accessedServices),
								columns: {
									composeId: true,
									name: true,
									composeStatus: true,
								},
							},
						},
						columns: {
							environmentId: true,
							isDefault: true,
							name: true,
						},
					},
					projectTags: {
						with: {
							tag: true,
						},
					},
				},
				orderBy: desc(projects.createdAt),
			});
		}

		return await db.query.projects.findMany({
			with: {
				environments: {
					with: {
						applications: {
							columns: {
								applicationId: true,
								name: true,
								applicationStatus: true,
							},
						},
						mariadb: {
							columns: {
								mariadbId: true,
							},
						},
						mongo: {
							columns: {
								mongoId: true,
							},
						},
						mysql: {
							columns: {
								mysqlId: true,
							},
						},
						postgres: {
							columns: {
								postgresId: true,
							},
						},
						redis: {
							columns: {
								redisId: true,
							},
						},
						compose: {
							columns: {
								composeId: true,
								name: true,
								composeStatus: true,
							},
						},
						libsql: {
							columns: {
								libsqlId: true,
							},
						},
					},
					columns: {
						name: true,
						environmentId: true,
						isDefault: true,
					},
				},
				projectTags: {
					with: {
						tag: true,
					},
				},
			},
			where: eq(projects.organizationId, ctx.session.activeOrganizationId),
			orderBy: desc(projects.createdAt),
		});
	}),

	allForPermissions: withPermission("member", "update").query(
		async ({ ctx }) => {
			return await db.query.projects.findMany({
				where: eq(projects.organizationId, ctx.session.activeOrganizationId),
				orderBy: desc(projects.createdAt),
				columns: {
					projectId: true,
					name: true,
				},
				with: {
					environments: {
						columns: {
							environmentId: true,
							name: true,
							isDefault: true,
						},
						with: {
							applications: {
								columns: {
									applicationId: true,
									appName: true,
									name: true,
									createdAt: true,
									applicationStatus: true,
									description: true,
									serverId: true,
								},
							},
							mariadb: {
								columns: {
									mariadbId: true,
									appName: true,
									name: true,
									createdAt: true,
									applicationStatus: true,
									description: true,
									serverId: true,
								},
							},
							postgres: {
								columns: {
									postgresId: true,
									appName: true,
									name: true,
									createdAt: true,
									applicationStatus: true,
									description: true,
									serverId: true,
								},
							},
							mysql: {
								columns: {
									mysqlId: true,
									appName: true,
									name: true,
									createdAt: true,
									applicationStatus: true,
									description: true,
									serverId: true,
								},
							},
							mongo: {
								columns: {
									mongoId: true,
									appName: true,
									name: true,
									createdAt: true,
									applicationStatus: true,
									description: true,
									serverId: true,
								},
							},
							redis: {
								columns: {
									redisId: true,
									appName: true,
									name: true,
									createdAt: true,
									applicationStatus: true,
									description: true,
									serverId: true,
								},
							},
							compose: {
								columns: {
									composeId: true,
									appName: true,
									name: true,
									createdAt: true,
									composeStatus: true,
									description: true,
									serverId: true,
								},
							},
							libsql: {
								columns: {
									libsqlId: true,
									appName: true,
									name: true,
									createdAt: true,
									applicationStatus: true,
									description: true,
									serverId: true,
								},
							},
						},
					},
				},
			});
		},
	),

	homeStats: protectedProcedure.query(async ({ ctx }) => {
		const isPrivileged =
			ctx.user.role === "owner" || ctx.user.role === "admin";

		let accessedProjects: string[] = [];
		let accessedEnvironments: string[] = [];
		let accessedServices: string[] = [];

		if (!isPrivileged) {
			const member = await findMemberByUserId(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			accessedProjects = member.accessedProjects;
			accessedEnvironments = member.accessedEnvironments;
			accessedServices = member.accessedServices;

			if (accessedProjects.length === 0) {
				return {
					projects: 0,
					environments: 0,
					applications: 0,
					compose: 0,
					databases: 0,
					services: 0,
					status: { running: 0, error: 0, idle: 0 },
				};
			}
		}

		const projectIdFilter = isPrivileged
			? eq(projects.organizationId, ctx.session.activeOrganizationId)
			: and(
					sql`${projects.projectId} IN (${sql.join(
						accessedProjects.map((id) => sql`${id}`),
						sql`, `,
					)})`,
					eq(projects.organizationId, ctx.session.activeOrganizationId),
				);

		const environmentFilter = isPrivileged
			? undefined
			: accessedEnvironments.length === 0
				? sql`false`
				: sql`${environments.environmentId} IN (${sql.join(
						accessedEnvironments.map((envId) => sql`${envId}`),
						sql`, `,
					)})`;

		const applyFilter = (col: AnyPgColumn) =>
			isPrivileged ? undefined : buildServiceFilter(col, accessedServices);

		const rows = await db.query.projects.findMany({
			where: projectIdFilter,
			columns: { projectId: true },
			with: {
				environments: {
					where: environmentFilter,
					columns: { environmentId: true },
					with: {
						applications: {
							where: applyFilter(applications.applicationId),
							columns: { applicationStatus: true },
						},
						compose: {
							where: applyFilter(compose.composeId),
							columns: { composeStatus: true },
						},
						libsql: {
							where: applyFilter(libsql.libsqlId),
							columns: { applicationStatus: true },
						},
						mariadb: {
							where: applyFilter(mariadb.mariadbId),
							columns: { applicationStatus: true },
						},
						mongo: {
							where: applyFilter(mongo.mongoId),
							columns: { applicationStatus: true },
						},
						mysql: {
							where: applyFilter(mysql.mysqlId),
							columns: { applicationStatus: true },
						},
						postgres: {
							where: applyFilter(postgres.postgresId),
							columns: { applicationStatus: true },
						},
						redis: {
							where: applyFilter(redis.redisId),
							columns: { applicationStatus: true },
						},
					},
				},
			},
		});

		let applicationsCount = 0;
		let composeCount = 0;
		let databasesCount = 0;
		let environmentsCount = 0;
		const status = { running: 0, error: 0, idle: 0 };
		const bump = (s?: string | null) => {
			if (s === "done") status.running++;
			else if (s === "error") status.error++;
			else status.idle++;
		};

		for (const project of rows) {
			for (const env of project.environments) {
				environmentsCount++;
				applicationsCount += env.applications.length;
				composeCount += env.compose.length;
				databasesCount +=
					env.libsql.length +
					env.mariadb.length +
					env.mongo.length +
					env.mysql.length +
					env.postgres.length +
					env.redis.length;

				for (const a of env.applications) bump(a.applicationStatus);
				for (const c of env.compose) bump(c.composeStatus);
				for (const s of env.libsql) bump(s.applicationStatus);
				for (const s of env.mariadb) bump(s.applicationStatus);
				for (const s of env.mongo) bump(s.applicationStatus);
				for (const s of env.mysql) bump(s.applicationStatus);
				for (const s of env.postgres) bump(s.applicationStatus);
				for (const s of env.redis) bump(s.applicationStatus);
			}
		}

		return {
			projects: rows.length,
			environments: environmentsCount,
			applications: applicationsCount,
			compose: composeCount,
			databases: databasesCount,
			services: applicationsCount + composeCount + databasesCount,
			status,
		};
	}),

	search: protectedProcedure
		.input(
			z.object({
				q: z.string().optional(),
				name: z.string().optional(),
				description: z.string().optional(),
				limit: z.number().min(1).max(100).default(20),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			const baseConditions = [
				eq(projects.organizationId, ctx.session.activeOrganizationId),
			];

			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(projects.name, term),
						ilike(projects.description ?? "", term),
					)!,
				);
			}

			if (input.name?.trim()) {
				baseConditions.push(ilike(projects.name, `%${input.name.trim()}%`));
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(projects.description ?? "", `%${input.description.trim()}%`),
				);
			}

			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				const { accessedProjects } = await findMemberByUserId(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (accessedProjects.length === 0) return { items: [], total: 0 };
				baseConditions.push(
					sql`${projects.projectId} IN (${sql.join(
						accessedProjects.map((id) => sql`${id}`),
						sql`, `,
					)})`,
				);
			}

			const where = and(...baseConditions);

			const [items, countResult] = await Promise.all([
				db.query.projects.findMany({
					where,
					limit: input.limit,
					offset: input.offset,
					orderBy: desc(projects.createdAt),
					columns: {
						projectId: true,
						name: true,
						description: true,
						createdAt: true,
						organizationId: true,
						env: true,
					},
				}),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(projects)
					.where(where),
			]);

			return {
				items,
				total: countResult[0]?.count ?? 0,
			};
		}),

	remove: protectedProcedure
		.input(apiRemoveProject)
		.mutation(async ({ input, ctx }) => {
			try {
				const currentProject = await findProjectById(input.projectId);
				if (
					currentProject.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to delete this project",
					});
				}
				await checkProjectAccess(ctx, "delete", input.projectId);
				const deletedProject = await deleteProject(input.projectId);

				await audit(ctx, {
					action: "delete",
					resourceType: "project",
					resourceId: currentProject.projectId,
					resourceName: currentProject.name,
				});
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

				if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
					const { accessedProjects } = await findMemberByUserId(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);
					if (!accessedProjects.includes(input.projectId)) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this project",
						});
					}
				}

				if (input.env !== undefined) {
					await checkPermission(ctx, { projectEnvVars: ["write"] });
				}

				const project = await updateProjectById(input.projectId, {
					...input,
				});

				if (project) {
					await audit(ctx, {
						action: "update",
						resourceType: "project",
						resourceId: input.projectId,
						resourceName: project.name,
					});
				}
				return project;
			} catch (error) {
				throw error;
			}
		}),
	duplicate: protectedProcedure
		.input(
			z.object({
				sourceEnvironmentId: z.string(),
				name: z.string(),
				description: z.string().optional(),
				includeServices: z.boolean().default(true),
				selectedServices: z
					.array(
						z.object({
							id: z.string(),
							type: z.enum([
								"application",
								"compose",
								"libsql",
								"mariadb",
								"mongo",
								"mysql",
								"postgres",
								"redis",
							]),
						}),
					)
					.optional(),
				duplicateInSameProject: z.boolean().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				await checkProjectAccess(ctx, "create");

				const sourceEnvironment = input.duplicateInSameProject
					? await findEnvironmentById(input.sourceEnvironmentId)
					: null;

				if (
					input.duplicateInSameProject &&
					sourceEnvironment?.project.organizationId !==
						ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}

				if (
					input.duplicateInSameProject &&
					sourceEnvironment &&
					ctx.user.role !== "owner" &&
					ctx.user.role !== "admin"
				) {
					const { accessedProjects } = await findMemberByUserId(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);
					if (!accessedProjects.includes(sourceEnvironment.project.projectId)) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this project",
						});
					}
				}

				const targetProject = input.duplicateInSameProject
					? sourceEnvironment
					: await createProject(
							{
								name: input.name,
								description: input.description,
								env: sourceEnvironment?.project.env,
							},
							ctx.session.activeOrganizationId,
						).then((value) => value.environment);

				console.log("targetProject", targetProject);

				if (input.includeServices) {
					const servicesToDuplicate = input.selectedServices || [];

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
									appName,
									refreshToken,
									...application
								} = await findApplicationById(id);
								const newAppName = appName.substring(
									0,
									appName.lastIndexOf("-"),
								);

								const newApplication = await createApplication({
									...application,
									appName: newAppName,
									name: input.duplicateInSameProject
										? `${application.name} (copy)`
										: application.name,
									environmentId: targetProject?.environmentId || "",
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
										domainId: undefined,
									});
								}

								break;
							}
							case "compose": {
								const {
									composeId,
									mounts,
									domains,
									appName,
									refreshToken,
									...compose
								} = await findComposeById(id);

								const newAppName = appName.substring(
									0,
									appName.lastIndexOf("-"),
								);

								const newCompose = await createCompose({
									...compose,
									appName: newAppName,
									name: input.duplicateInSameProject
										? `${compose.name} (copy)`
										: compose.name,
									environmentId: targetProject?.environmentId || "",
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
							case "libsql": {
								const { libsqlId, mounts, appName, ...libsql } =
									await findLibsqlById(id);

								const newAppName = appName.substring(
									0,
									appName.lastIndexOf("-"),
								);

								const newLibsql = await createLibsql({
									...libsql,
									appName: newAppName,
									name: input.duplicateInSameProject
										? `${libsql.name} (copy)`
										: libsql.name,
									environmentId: targetProject?.environmentId || "",
								});

								for (const mount of mounts) {
									const { mountId, ...rest } = mount;
									await createMount({
										...rest,
										serviceId: newLibsql.libsqlId,
										serviceType: "libsql",
									});
								}

								break;
							}
							case "mariadb": {
								const { mariadbId, mounts, backups, appName, ...mariadb } =
									await findMariadbById(id);

								const newAppName = appName.substring(
									0,
									appName.lastIndexOf("-"),
								);

								const newMariadb = await createMariadb({
									...mariadb,
									appName: newAppName,
									name: input.duplicateInSameProject
										? `${mariadb.name} (copy)`
										: mariadb.name,
									environmentId: targetProject?.environmentId || "",
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
									const { backupId, appName: _appName, ...rest } = backup;
									await createBackup({
										...rest,
										mariadbId: newMariadb.mariadbId,
									});
								}
								break;
							}
							case "mongo": {
								const { mongoId, mounts, backups, appName, ...mongo } =
									await findMongoById(id);

								const newAppName = appName.substring(
									0,
									appName.lastIndexOf("-"),
								);

								const newMongo = await createMongo({
									...mongo,
									appName: newAppName,
									name: input.duplicateInSameProject
										? `${mongo.name} (copy)`
										: mongo.name,
									environmentId: targetProject?.environmentId || "",
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
									const { backupId, appName: _appName, ...rest } = backup;
									await createBackup({
										...rest,
										mongoId: newMongo.mongoId,
									});
								}
								break;
							}
							case "mysql": {
								const { mysqlId, mounts, backups, appName, ...mysql } =
									await findMySqlById(id);

								const newAppName = appName.substring(
									0,
									appName.lastIndexOf("-"),
								);

								const newMysql = await createMysql({
									...mysql,
									appName: newAppName,
									name: input.duplicateInSameProject
										? `${mysql.name} (copy)`
										: mysql.name,
									environmentId: targetProject?.environmentId || "",
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
									const { backupId, appName: _appName, ...rest } = backup;
									await createBackup({
										...rest,
										mysqlId: newMysql.mysqlId,
									});
								}
								break;
							}
							case "postgres": {
								const { postgresId, mounts, backups, appName, ...postgres } =
									await findPostgresById(id);

								const newAppName = appName.substring(
									0,
									appName.lastIndexOf("-"),
								);

								const newPostgres = await createPostgres({
									...postgres,
									appName: newAppName,
									name: input.duplicateInSameProject
										? `${postgres.name} (copy)`
										: postgres.name,
									environmentId: targetProject?.environmentId || "",
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
							case "redis": {
								const { redisId, mounts, appName, ...redis } =
									await findRedisById(id);

								const newAppName = appName.substring(
									0,
									appName.lastIndexOf("-"),
								);

								const newRedis = await createRedis({
									...redis,
									appName: newAppName,
									name: input.duplicateInSameProject
										? `${redis.name} (copy)`
										: redis.name,
									environmentId: targetProject?.environmentId || "",
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
						}
					};

					for (const service of servicesToDuplicate) {
						await duplicateService(service.id, service.type);
					}
				}

				if (!input.duplicateInSameProject) {
					await addNewProject(ctx, targetProject?.projectId || "");
				}

				await audit(ctx, {
					action: "create",
					resourceType: "project",
					resourceId: targetProject?.projectId || "",
					resourceName: input.name,
					metadata: { duplicatedFrom: input.sourceEnvironmentId },
				});
				return targetProject;
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
	return accessedServices.length === 0
		? sql`false`
		: sql`${fieldName} IN (${sql.join(
				accessedServices.map((serviceId) => sql`${serviceId}`),
				sql`, `,
			)})`;
}
