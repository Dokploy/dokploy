import {
	createEnvironment,
	deleteEnvironment,
	duplicateEnvironment,
	findEnvironmentById,
	findEnvironmentsByProjectId,
	updateEnvironmentById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { redactGitProviderSecrets } from "@dokploy/server/services/git-provider";
import {
	addNewEnvironment,
	checkEnvironmentAccess,
	checkEnvironmentCreationPermission,
	checkEnvironmentDeletionPermission,
	checkPermission,
	findMemberByUserId,
	hasPermission,
} from "@dokploy/server/services/permission";
import {
	preserveSecretPlaceholderFields,
	redactDatabaseServiceSecrets,
	redactDeployableServiceSecrets,
	redactSecretFields,
	redactSensitiveText,
} from "@dokploy/server/utils/security/redaction";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import { assertTargetProjectAccess } from "@/server/api/utils/placement-access";
import {
	apiCreateEnvironment,
	apiDuplicateEnvironment,
	apiFindOneEnvironment,
	apiRemoveEnvironment,
	apiUpdateEnvironment,
	environments,
	projects,
} from "@/server/db/schema";

type SecretRecord = Record<string, unknown>;

const redactCustomGitUrl = <T extends SecretRecord | null | undefined>(
	record: T,
) => {
	if (!record) {
		return record;
	}

	const redacted = { ...record };

	if ("customGitUrl" in redacted) {
		redacted.customGitUrl = redactSensitiveText(
			redacted.customGitUrl as string | null | undefined,
		);
	}

	return redacted as T;
};

const redactDeployableEnvironmentServiceSecrets = <
	T extends SecretRecord | null | undefined,
>(
	record: T,
) => {
	if (!record) {
		return record;
	}

	return redactCustomGitUrl(
		redactDeployableServiceSecrets(
			redactGitProviderSecrets(
				record as T & {
					bitbucket?: object | null;
					gitea?: object | null;
					github?: object | null;
					gitlab?: object | null;
				},
			),
		),
	);
};

const redactComposeEnvironmentServiceSecrets = <
	T extends SecretRecord | null | undefined,
>(
	record: T,
) =>
	redactSecretFields(redactDeployableEnvironmentServiceSecrets(record), [
		"composeFile",
	]);

const redactEnvironmentEnv = <T extends SecretRecord | null | undefined>(
	environment: T,
) => redactSecretFields(environment, ["env"]);

const redactProjectEnv = <T extends SecretRecord>(environment: T): T => {
	if (
		!("project" in environment) ||
		!environment.project ||
		typeof environment.project !== "object"
	) {
		return environment;
	}

	return {
		...environment,
		project: redactSecretFields(environment.project as SecretRecord, ["env"]),
	} as T;
};

const redactEnvironmentServiceSecrets = <
	T extends SecretRecord & {
		applications?: SecretRecord[];
		compose?: SecretRecord[];
		libsql?: SecretRecord[];
		mariadb?: SecretRecord[];
		mongo?: SecretRecord[];
		mysql?: SecretRecord[];
		postgres?: SecretRecord[];
		redis?: SecretRecord[];
	},
>(
	environment: T,
) => {
	const redacted = { ...environment };

	if (Array.isArray(redacted.applications)) {
		redacted.applications = redacted.applications.map(
			redactDeployableEnvironmentServiceSecrets,
		);
	}
	if (Array.isArray(redacted.compose)) {
		redacted.compose = redacted.compose.map(
			redactComposeEnvironmentServiceSecrets,
		);
	}
	if (Array.isArray(redacted.libsql)) {
		redacted.libsql = redacted.libsql.map(redactDatabaseServiceSecrets);
	}
	if (Array.isArray(redacted.mariadb)) {
		redacted.mariadb = redacted.mariadb.map(redactDatabaseServiceSecrets);
	}
	if (Array.isArray(redacted.mongo)) {
		redacted.mongo = redacted.mongo.map(redactDatabaseServiceSecrets);
	}
	if (Array.isArray(redacted.mysql)) {
		redacted.mysql = redacted.mysql.map(redactDatabaseServiceSecrets);
	}
	if (Array.isArray(redacted.postgres)) {
		redacted.postgres = redacted.postgres.map(redactDatabaseServiceSecrets);
	}
	if (Array.isArray(redacted.redis)) {
		redacted.redis = redacted.redis.map(redactDatabaseServiceSecrets);
	}

	return redacted as T;
};

const canReadEnvironmentEnvVars = (ctx: {
	user: { id: string };
	session: { activeOrganizationId: string };
}) =>
	hasPermission(ctx, {
		environmentEnvVars: ["read"],
	});

const canReadProjectEnvVars = (ctx: {
	user: { id: string };
	session: { activeOrganizationId: string };
}) =>
	hasPermission(ctx, {
		projectEnvVars: ["read"],
	});

const redactEnvironmentForPermissions = <T extends SecretRecord>(
	environment: T,
	canReadEnvironmentEnv: boolean,
	canReadProjectEnv: boolean,
) => {
	let redactedEnvironment = redactEnvironmentServiceSecrets(environment);

	if (!canReadEnvironmentEnv) {
		redactedEnvironment =
			(redactEnvironmentEnv(redactedEnvironment) as T | null | undefined) ??
			redactedEnvironment;
	}

	if (!canReadProjectEnv) {
		redactedEnvironment = redactProjectEnv(redactedEnvironment);
	}

	return redactedEnvironment;
};

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
				await assertTargetProjectAccess(ctx, input.projectId);

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
				const canReadEnvironmentEnv = await canReadEnvironmentEnvVars(ctx);
				const canReadProjectEnv = await canReadProjectEnvVars(ctx);

				return redactEnvironmentForPermissions(
					filteredEnvironment,
					canReadEnvironmentEnv,
					canReadProjectEnv,
				);
			}

			const canReadEnvironmentEnv = await canReadEnvironmentEnvVars(ctx);
			const canReadProjectEnv = await canReadProjectEnvVars(ctx);
			return redactEnvironmentForPermissions(
				environment,
				canReadEnvironmentEnv,
				canReadProjectEnv,
			);
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
					const canReadEnvironmentEnv = await canReadEnvironmentEnvVars(ctx);
					const canReadProjectEnv = await canReadProjectEnvVars(ctx);

					return filteredEnvironments.map((environment) =>
						redactEnvironmentForPermissions(
							environment,
							canReadEnvironmentEnv,
							canReadProjectEnv,
						),
					);
				}

				const canReadEnvironmentEnv = await canReadEnvironmentEnvVars(ctx);
				const canReadProjectEnv = await canReadProjectEnvVars(ctx);
				return environments.map((environment) =>
					redactEnvironmentForPermissions(
						environment,
						canReadEnvironmentEnv,
						canReadProjectEnv,
					),
				);
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

				await checkEnvironmentAccess(ctx, environmentId, "update");

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
					preserveSecretPlaceholderFields(updateData, currentEnvironment, [
						"env",
					]),
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
				await checkEnvironmentCreationPermission(ctx, environment.projectId);
				await checkPermission(ctx, { environmentEnvVars: ["read", "write"] });

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
				if (error instanceof TRPCError) {
					throw error;
				}
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

			const canReadEnvironmentEnv = await canReadEnvironmentEnvVars(ctx);
			const redactedItems = items.map((environment) =>
				redactEnvironmentForPermissions(
					environment,
					canReadEnvironmentEnv,
					true,
				),
			);

			return {
				items: redactedItems,
				total: countResult[0]?.count ?? 0,
			};
		}),
});
