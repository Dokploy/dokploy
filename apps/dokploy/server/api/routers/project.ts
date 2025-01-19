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

import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import {
	IS_CLOUD,
	addNewProject,
	checkProjectAccess,
	createProject,
	deleteProject,
	findAdminById,
	findProjectById,
	findUserByAuthId,
	updateProjectById,
} from "@dokploy/server";

export const projectRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateProject)
		.mutation(async ({ ctx, input }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkProjectAccess(ctx.user.authId, "create");
				}

				const admin = await findAdminById(ctx.user.adminId);

				if (admin.serversQuantity === 0 && IS_CLOUD) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No servers available, Please subscribe to a plan",
					});
				}

				const project = await createProject(input, ctx.user.adminId);
				if (ctx.user.rol === "user") {
					await addNewProject(ctx.user.authId, project.projectId);
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
			if (ctx.user.rol === "user") {
				const { accessedServices } = await findUserByAuthId(ctx.user.authId);

				await checkProjectAccess(ctx.user.authId, "access", input.projectId);

				const project = await db.query.projects.findFirst({
					where: and(
						eq(projects.projectId, input.projectId),
						eq(projects.adminId, ctx.user.adminId),
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

			if (project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this project",
				});
			}
			return project;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		if (ctx.user.rol === "user") {
			const { accessedProjects, accessedServices } = await findUserByAuthId(
				ctx.user.authId,
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
					eq(projects.adminId, ctx.user.adminId),
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
			where: eq(projects.adminId, ctx.user.adminId),
			orderBy: desc(projects.createdAt),
		});
	}),

	remove: protectedProcedure
		.input(apiRemoveProject)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkProjectAccess(ctx.user.authId, "delete");
				}
				const currentProject = await findProjectById(input.projectId);
				if (currentProject.adminId !== ctx.user.adminId) {
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
				if (currentProject.adminId !== ctx.user.adminId) {
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
