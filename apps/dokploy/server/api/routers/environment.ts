import {
	createEnvironment,
	deleteEnvironment,
	duplicateEnvironment,
	findEnvironmentById,
	findEnvironmentsByProjectId,
	updateEnvironmentById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	addNewEnvironment,
	checkEnvironmentAccess,
	checkEnvironmentCreationPermission,
	checkEnvironmentDeletionPermission,
	checkPermission,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateEnvironment,
	apiDuplicateEnvironment,
	apiFindOneEnvironment,
	apiRemoveEnvironment,
	apiUpdateEnvironment,
	environments,
	projects,
} from "@/server/db/schema";

const filterEnvironmentServices = (
	environment: any,
	accessedServices: string[],
) => ({
	...environment,
	applications: environment.applications.filter((app: any) =>
		accessedServices.includes(app.applicationId),
	),
	compose: environment.compose.filter((comp: any) =>
		accessedServices.includes(comp.composeId),
	),
	libsql: environment.libsql.filter((db: any) =>
		accessedServices.includes(db.libsqlId),
	),
	mariadb: environment.mariadb.filter((db: any) =>
		accessedServices.includes(db.mariadbId),
	),
	mongo: environment.mongo.filter((db: any) =>
		accessedServices.includes(db.mongoId),
	),
	mysql: environment.mysql.filter((db: any) =>
		accessedServices.includes(db.mysqlId),
	),
	postgres: environment.postgres.filter((db: any) =>
		accessedServices.includes(db.postgresId),
	),
	redis: environment.redis.filter((db: any) =>
		accessedServices.includes(db.redisId),
	),
});

export const environmentRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateEnvironment)
		.mutation(async ({ input, ctx }) => {
			try {
				await checkEnvironmentCreationPermission(ctx, input.projectId);

				if (input.name === "production") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"You cannot create a environment with the name 'production'",
					});
				}

				const environment = await createEnvironment(input);

				await addNewEnvironment(ctx, environment.environmentId);
				await audit(ctx, {
					action: "create",
					resourceType: "environment",
					resourceId: environment.environmentId,
					resourceName: environment.name,
				});
				return environment;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error creating the environment: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),

	one: protectedProcedure
		.input(apiFindOneEnvironment)
		.query(async ({ input, ctx }) => {
			const environment = await findEnvironmentById(input.environmentId);
			if (
				environment.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not allowed to access this environment",
				});
			}

			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				const { accessedEnvironments, accessedServices } =
					await findMemberByUserId(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);

				if (!accessedEnvironments.includes(environment.environmentId)) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				const filteredEnvironment = filterEnvironmentServices(
					environment,
					accessedServices,
				);

				return filteredEnvironment;
			}

			return environment;
		}),

	byProjectId: protectedProcedure
		.input(z.object({ projectId: z.string() }))
		.query(async ({ input, ctx }) => {
			try {
				const environments = await findEnvironmentsByProjectId(input.projectId);

				if (
					environments.some(
						(environment) =>
							environment.project.organizationId !==
							ctx.session.activeOrganizationId,
					)
				) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
					const { accessedEnvironments, accessedServices } =
						await findMemberByUserId(
							ctx.user.id,
							ctx.session.activeOrganizationId,
						);

					const filteredEnvironments = environments
						.filter((environment) =>
							accessedEnvironments.includes(environment.environmentId),
						)
						.map((environment) =>
							filterEnvironmentServices(environment, accessedServices),
						);

					return filteredEnvironments;
				}

				return environments;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error fetching environments: ${error instanceof Error ? error.message : error}`,
				});
			}
		}),

	remove: protectedProcedure
		.input(apiRemoveEnvironment)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				if (
					environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				if (environment.isDefault) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "You cannot delete the default environment",
					});
				}

				await checkEnvironmentDeletionPermission(ctx, environment.projectId);

				await checkEnvironmentAccess(ctx, input.environmentId, "read");

				const deletedEnvironment = await deleteEnvironment(input.environmentId);
				await audit(ctx, {
					action: "delete",
					resourceType: "environment",
					resourceId: deletedEnvironment?.environmentId,
					resourceName: deletedEnvironment?.name,
				});
				return deletedEnvironment;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error deleting the environment: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),

	update: protectedProcedure
		.input(apiUpdateEnvironment)
		.mutation(async ({ input, ctx }) => {
			try {
				const { environmentId, ...updateData } = input;

				await checkEnvironmentAccess(ctx, environmentId, "read");

				if (updateData.env !== undefined) {
					await checkPermission(ctx, { environmentEnvVars: ["write"] });
				}

				const currentEnvironment = await findEnvironmentById(environmentId);

				if (currentEnvironment.isDefault && updateData.name !== undefined) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "You cannot rename the default environment",
					});
				}
				if (
					currentEnvironment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
					const { accessedEnvironments } = await findMemberByUserId(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);

					if (
						!accessedEnvironments.includes(currentEnvironment.environmentId)
					) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "You are not allowed to update this environment",
						});
					}
				}

				const environment = await updateEnvironmentById(
					environmentId,
					updateData,
				);
				if (environment) {
					await audit(ctx, {
						action: "update",
						resourceType: "environment",
						resourceId: environment.environmentId,
						resourceName: environment.name,
					});
				}
				return environment;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error updating the environment: ${error instanceof Error ? error.message : error}`,
				});
			}
		}),

	duplicate: protectedProcedure
		.input(apiDuplicateEnvironment)
		.mutation(async ({ input, ctx }) => {
			try {
				await checkEnvironmentAccess(ctx, input.environmentId, "read");
				const environment = await findEnvironmentById(input.environmentId);
				if (
					environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not allowed to access this environment",
					});
				}

				if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
					const { accessedEnvironments } = await findMemberByUserId(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);

					if (!accessedEnvironments.includes(environment.environmentId)) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "You are not allowed to duplicate this environment",
						});
					}
				}

				const duplicatedEnvironment = await duplicateEnvironment(input);
				await audit(ctx, {
					action: "create",
					resourceType: "environment",
					resourceId: duplicatedEnvironment.environmentId,
					resourceName: duplicatedEnvironment.name,
					metadata: { duplicatedFrom: input.environmentId },
				});
				return duplicatedEnvironment;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error duplicating the environment: ${error instanceof Error ? error.message : error}`,
				});
			}
		}),

	search: protectedProcedure
		.input(
			z.object({
				q: z.string().optional(),
				name: z.string().optional(),
				description: z.string().optional(),
				projectId: z.string().optional(),
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

			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(environments.name, term),
						ilike(environments.description ?? "", term),
					)!,
				);
			}

			if (input.name?.trim()) {
				baseConditions.push(ilike(environments.name, `%${input.name.trim()}%`));
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(
						environments.description ?? "",
						`%${input.description.trim()}%`,
					),
				);
			}

			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				const { accessedEnvironments } = await findMemberByUserId(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				if (accessedEnvironments.length === 0) return { items: [], total: 0 };
				baseConditions.push(
					sql`${environments.environmentId} IN (${sql.join(
						accessedEnvironments.map((id) => sql`${id}`),
						sql`, `,
					)})`,
				);
			}

			const where = and(...baseConditions);

			const [items, countResult] = await Promise.all([
				db
					.select({
						environmentId: environments.environmentId,
						name: environments.name,
						description: environments.description,
						createdAt: environments.createdAt,
						env: environments.env,
						projectId: environments.projectId,
						isDefault: environments.isDefault,
					})
					.from(environments)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(environments.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(environments)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where),
			]);

			return {
				items,
				total: countResult[0]?.count ?? 0,
			};
		}),
});
