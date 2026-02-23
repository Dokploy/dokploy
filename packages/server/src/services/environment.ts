import { db } from "@dokploy/server/db";
import {
	type apiCreateEnvironment,
	type apiDuplicateEnvironment,
	environments,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";

export type Environment = typeof environments.$inferSelect;

export const createEnvironment = async (
	input: typeof apiCreateEnvironment._type,
) => {
	const newEnvironment = await db
		.insert(environments)
		.values({
			...input,
		})
		.returning()
		.then((value) => value[0]);

	if (!newEnvironment) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the environment",
		});
	}

	return newEnvironment;
};

export const findEnvironmentById = async (environmentId: string) => {
	const environment = await db.query.environments.findFirst({
		where: eq(environments.environmentId, environmentId),
		with: {
			applications: {
				with: {
					deployments: true,
					server: true,
				},
			},
			mariadb: {
				with: {
					server: true,
				},
			},
			mongo: {
				with: {
					server: true,
				},
			},
			mysql: {
				with: {
					server: true,
				},
			},
			postgres: {
				with: {
					server: true,
				},
			},
			redis: {
				with: {
					server: true,
				},
			},
			compose: {
				with: {
					deployments: true,
					server: true,
				},
			},
			project: true,
		},
	});
	if (!environment) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Environment not found",
		});
	}
	return environment;
};

export const findEnvironmentsByProjectId = async (projectId: string) => {
	const projectEnvironments = await db.query.environments.findMany({
		where: eq(environments.projectId, projectId),
		orderBy: asc(environments.createdAt),
		with: {
			applications: true,
			mariadb: true,
			mongo: true,
			mysql: true,
			postgres: true,
			redis: true,
			compose: true,
			project: true,
		},
	});
	return projectEnvironments;
};

const environmentHasServices = (
	env: Awaited<ReturnType<typeof findEnvironmentById>>,
) => {
	return (
		(env.applications?.length ?? 0) > 0 ||
		(env.compose?.length ?? 0) > 0 ||
		(env.mariadb?.length ?? 0) > 0 ||
		(env.mongo?.length ?? 0) > 0 ||
		(env.mysql?.length ?? 0) > 0 ||
		(env.postgres?.length ?? 0) > 0 ||
		(env.redis?.length ?? 0) > 0
	);
};

export const deleteEnvironment = async (environmentId: string) => {
	const currentEnvironment = await findEnvironmentById(environmentId);
	if (currentEnvironment.isDefault) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "You cannot delete the default environment",
		});
	}
	if (environmentHasServices(currentEnvironment)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cannot delete environment: it has active services. Delete all services first.",
		});
	}
	const deletedEnvironment = await db
		.delete(environments)
		.where(eq(environments.environmentId, environmentId))
		.returning()
		.then((value) => value[0]);

	return deletedEnvironment;
};

export const updateEnvironmentById = async (
	environmentId: string,
	environmentData: Partial<Environment>,
) => {
	const result = await db
		.update(environments)
		.set({
			...environmentData,
		})
		.where(eq(environments.environmentId, environmentId))
		.returning()
		.then((res) => res[0]);

	return result;
};

export const duplicateEnvironment = async (
	input: typeof apiDuplicateEnvironment._type,
) => {
	// Find the original environment
	const originalEnvironment = await findEnvironmentById(input.environmentId);

	// Create a new environment with the provided name and description
	const newEnvironment = await db
		.insert(environments)
		.values({
			name: input.name,
			description: input.description || originalEnvironment.description,
			projectId: originalEnvironment.projectId,
		})
		.returning()
		.then((value) => value[0]);

	if (!newEnvironment) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error duplicating the environment",
		});
	}

	return newEnvironment;
};

export const createProductionEnvironment = async (projectId: string) => {
	const newEnvironment = await db
		.insert(environments)
		.values({
			name: "production",
			description: "Production environment",
			projectId,
			isDefault: true,
		})
		.returning()
		.then((value) => value[0]);

	if (!newEnvironment) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the production environment",
		});
	}

	return newEnvironment;
};
