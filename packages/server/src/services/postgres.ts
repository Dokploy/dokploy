import { db } from "@dokploy/server/db";
import {
	type apiCreatePostgres,
	applications,
	backups,
	buildAppName,
	environments,
	postgres,
	projects,
} from "@dokploy/server/db/schema";
import { generatePassword } from "@dokploy/server/templates";
import { buildPostgres } from "@dokploy/server/utils/databases/postgres";
import { pullImage } from "@dokploy/server/utils/docker/utils";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq, getTableColumns } from "drizzle-orm";
import { updateApplication } from "./application";
import { validUniqueServerAppName } from "./project";

export function getMountPath(dockerImage: string): string {
	const versionMatch = dockerImage.match(/postgres:(\d+)/);

	if (versionMatch?.[1]) {
		const version = Number.parseInt(versionMatch[1], 10);
		if (version >= 18) {
			// PostgreSQL 18+ uses /var/lib/postgresql/{version}/docker as the default PGDATA
			return `/var/lib/postgresql/${version}/docker`;
		}
	}
	return "/var/lib/postgresql/data";
}

export type Postgres = typeof postgres.$inferSelect;

export const createPostgres = async (input: typeof apiCreatePostgres._type) => {
	const appName = buildAppName("postgres", input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Service with this 'AppName' already exists",
		});
	}

	const newPostgres = await db
		.insert(postgres)
		.values({
			...input,
			databasePassword: input.databasePassword
				? input.databasePassword
				: generatePassword(),
			appName,
		})
		.returning()
		.then((value) => value[0]);

	if (!newPostgres) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting postgresql database",
		});
	}

	return newPostgres;
};
export const findPostgresById = async (postgresId: string) => {
	const result = await db.query.postgres.findFirst({
		where: eq(postgres.postgresId, postgresId),
		with: {
			environment: {
				with: {
					project: true,
				},
			},
			mounts: true,
			server: true,
			backups: {
				with: {
					destination: true,
					deployments: true,
				},
			},
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Postgres not found",
		});
	}
	return result;
};

export const findPostgresByBackupId = async (backupId: string) => {
	const result = await db
		.select({
			...getTableColumns(postgres),
		})
		.from(postgres)
		.innerJoin(backups, eq(postgres.postgresId, backups.postgresId))
		.where(eq(backups.backupId, backupId))
		.limit(1);

	if (!result || !result[0]) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Postgres not found",
		});
	}
	return result[0];
};

export const updatePostgresById = async (
	postgresId: string,
	postgresData: Partial<Postgres>,
) => {
	const { appName, ...rest } = postgresData;
	const result = await db
		.update(postgres)
		.set({
			...rest,
		})
		.where(eq(postgres.postgresId, postgresId))
		.returning();

	return result[0];
};

export const removePostgresById = async (postgresId: string) => {
	const result = await db
		.delete(postgres)
		.where(eq(postgres.postgresId, postgresId))
		.returning();

	return result[0];
};

export const deployPostgres = async (
	postgresId: string,
	onData?: (data: any) => void,
) => {
	const postgres = await findPostgresById(postgresId);
	try {
		await updatePostgresById(postgresId, {
			applicationStatus: "running",
		});

		onData?.("Starting postgres deployment...");

		if (postgres.serverId) {
			await execAsyncRemote(
				postgres.serverId,
				`docker pull ${postgres.dockerImage}`,
				onData,
			);
		} else {
			await pullImage(postgres.dockerImage, onData);
		}

		await buildPostgres(postgres);

		await updatePostgresById(postgresId, {
			applicationStatus: "done",
		});

		onData?.("Deployment completed successfully!");
	} catch (error) {
		onData?.(`Error: ${error}`);
		await updatePostgresById(postgresId, {
			applicationStatus: "error",
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Error on deploy postgres${error}`,
		});
	}
	return postgres;
};

export const changePostgresPassword = async (
	postgresId: string,
	newPassword: string,
) => {
	const postgres = await findPostgresById(postgresId);

	// 1. Update in Docker Container
	let command: string;
	if (postgres.serverId) {
		const { stdout: containerId } = await execAsyncRemote(
			postgres.serverId,
			`docker ps -q -f name=${postgres.appName}`,
		);
		if (!containerId) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Container not found for service: ${postgres.appName}`,
			});
		}
		command = `docker exec ${containerId.trim()} psql -U ${postgres.databaseUser} -c "ALTER USER ${postgres.databaseUser} WITH PASSWORD '${newPassword}';"`;
		await execAsyncRemote(postgres.serverId, command);
	} else {
		const { stdout: containerId } = await execAsync(
			`docker ps -q -f name=${postgres.appName}`,
		);
		if (!containerId) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Container not found for service: ${postgres.appName}`,
			});
		}
		command = `docker exec ${containerId.trim()} psql -U ${postgres.databaseUser} -c "ALTER USER ${postgres.databaseUser} WITH PASSWORD '${newPassword}';"`;
		await execAsync(command);
	}

	// 2. Update in Dokploy Database
	await updatePostgresById(postgresId, {
		databasePassword: newPassword,
	});

	// 3. Update Dependent Applications
	const project = postgres.environment.project;

	// Find all applications in the same organization
	const allApplications = await db
		.select({
			applicationId: applications.applicationId,
			env: applications.env,
			name: applications.name,
		})
		.from(applications)
		.innerJoin(
			environments,
			eq(applications.environmentId, environments.environmentId),
		)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.where(eq(projects.organizationId, project.organizationId));

	// Update applications that have the old connection string
	const oldPassword = postgres.databasePassword;
	let updatedCount = 0;

	for (const app of allApplications) {
		if (app.env?.includes(oldPassword)) {
			// Replace all occurrences of the old password in the env string if it's part of a connection string context ideally,
			// but for now simple replacement as per requirement.
			// To be safer we could look for the specific connection string format, but 'includes' check + replace is standard for this scope.
			const newEnv = app.env.replace(new RegExp(oldPassword, "g"), newPassword);

			await updateApplication(app.applicationId, {
				env: newEnv,
			});
			updatedCount++;
		}
	}

	return { success: true, updatedApplications: updatedCount };
};
