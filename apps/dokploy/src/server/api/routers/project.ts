import {
	cliProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateProject,
	apiFindOneProject,
	apiRemoveProject,
	apiUpdateProject,
	projects,
} from "@/server/db/schema/project";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import {
	createProject,
	deleteProject,
	findProjectById,
	updateProjectById,
} from "../services/project";
import {
	addNewProject,
	checkProjectAccess,
	findUserByAuthId,
} from "../services/user";
import {
	applications,
	compose,
	mariadb,
	mongo,
	mysql,
	postgres,
	redis,
} from "@/server/db/schema";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const projectRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateProject)
		.mutation(async ({ ctx, input }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkProjectAccess(ctx.user.authId, "create");
				}
				const project = await createProject(input);
				if (ctx.user.rol === "user") {
					await addNewProject(ctx.user.authId, project.projectId);
				}

				return project;
			} catch (error) {
				console.log(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the project",
					cause: error,
				});
			}
		}),

	one: protectedProcedure
		.input(apiFindOneProject)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				const { accesedServices } = await findUserByAuthId(ctx.user.authId);

				await checkProjectAccess(ctx.user.authId, "access", input.projectId);

				const service = await db.query.projects.findFirst({
					where: eq(projects.projectId, input.projectId),
					with: {
						compose: {
							where: buildServiceFilter(compose.composeId, accesedServices),
						},
						applications: {
							where: buildServiceFilter(
								applications.applicationId,
								accesedServices,
							),
						},
						mariadb: {
							where: buildServiceFilter(mariadb.mariadbId, accesedServices),
						},
						mongo: {
							where: buildServiceFilter(mongo.mongoId, accesedServices),
						},
						mysql: {
							where: buildServiceFilter(mysql.mysqlId, accesedServices),
						},
						postgres: {
							where: buildServiceFilter(postgres.postgresId, accesedServices),
						},
						redis: {
							where: buildServiceFilter(redis.redisId, accesedServices),
						},
					},
				});

				if (!service) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Project not found",
					});
				}
				return service;
			}
			const project = await findProjectById(input.projectId);
			return project;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		if (ctx.user.rol === "user") {
			const { accesedProjects, accesedServices } = await findUserByAuthId(
				ctx.user.authId,
			);

			if (accesedProjects.length === 0) {
				return [];
			}
			const query = await db.query.projects.findMany({
				where: sql`${projects.projectId} IN (${sql.join(
					accesedProjects.map((projectId) => sql`${projectId}`),
					sql`, `,
				)})`,
				with: {
					applications: {
						where: buildServiceFilter(
							applications.applicationId,
							accesedServices,
						),
					},
					mariadb: {
						where: buildServiceFilter(mariadb.mariadbId, accesedServices),
					},
					mongo: {
						where: buildServiceFilter(mongo.mongoId, accesedServices),
					},
					mysql: {
						where: buildServiceFilter(mysql.mysqlId, accesedServices),
					},
					postgres: {
						where: buildServiceFilter(postgres.postgresId, accesedServices),
					},
					redis: {
						where: buildServiceFilter(redis.redisId, accesedServices),
					},
					compose: {
						where: buildServiceFilter(compose.composeId, accesedServices),
					},
				},
				orderBy: desc(projects.createdAt),
			});

			return query;
		}
		return await db.query.projects.findMany({
			with: {
				applications: true,
				mariadb: true,
				mongo: true,
				mysql: true,
				postgres: true,
				redis: true,
				compose: true,
			},
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
				const project = await deleteProject(input.projectId);

				return project;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this project",
					cause: error,
				});
			}
		}),
	update: protectedProcedure
		.input(apiUpdateProject)
		.mutation(async ({ input }) => {
			try {
				const project = updateProjectById(input.projectId, {
					...input,
				});

				return project;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to update this project",
					cause: error,
				});
			}
		}),
});
function buildServiceFilter(fieldName: AnyPgColumn, accesedServices: string[]) {
	return accesedServices.length > 0
		? sql`${fieldName} IN (${sql.join(
				accesedServices.map((serviceId) => sql`${serviceId}`),
				sql`, `,
			)})`
		: sql`1 = 0`; // Always false condition
}
