import { db } from "@dokploy/server/db";
import {
	type apiCreateProject,
	applications,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	projects,
	redis,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { createProductionEnvironment } from "./environment";

export type Project = typeof projects.$inferSelect;

export const createProject = async (
	input: z.infer<typeof apiCreateProject>,
	organizationId: string,
) => {
	const newProject = await db
		.insert(projects)
		.values({
			...input,
			organizationId: organizationId,
		})
		.returning()
		.then((value) => value[0]);

	if (!newProject) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the project",
		});
	}

	// Automatically create a production environment
	const newEnvironment = await createProductionEnvironment(
		newProject.projectId,
	);
	return {
		project: newProject,
		environment: newEnvironment,
	};
};

export const serviceColumns = {
	name: true,
	description: true,
	appName: true,
	createdAt: true,
	serverId: true,
	applicationStatus: true,
} as const;

export const findProjectById = async (projectId: string) => {
	const project = await db.query.projects.findFirst({
		where: eq(projects.projectId, projectId),
		with: {
			environments: {
				with: {
					applications: {
						columns: {
							...serviceColumns,
							applicationId: true,
							icon: true,
						},
						with: { server: { columns: { name: true } } },
					},
					compose: {
						columns: {
							...serviceColumns,
							composeId: true,
							composeStatus: true,
						},
						with: { server: { columns: { name: true } } },
					},
					libsql: {
						columns: { ...serviceColumns, libsqlId: true },
						with: { server: { columns: { name: true } } },
					},
					mariadb: {
						columns: { ...serviceColumns, mariadbId: true },
						with: { server: { columns: { name: true } } },
					},
					mongo: {
						columns: { ...serviceColumns, mongoId: true },
						with: { server: { columns: { name: true } } },
					},
					mysql: {
						columns: { ...serviceColumns, mysqlId: true },
						with: { server: { columns: { name: true } } },
					},
					postgres: {
						columns: { ...serviceColumns, postgresId: true },
						with: { server: { columns: { name: true } } },
					},
					redis: {
						columns: { ...serviceColumns, redisId: true },
						with: { server: { columns: { name: true } } },
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
};

export const deleteProject = async (projectId: string) => {
	const project = await db
		.delete(projects)
		.where(eq(projects.projectId, projectId))
		.returning()
		.then((value) => value[0]);

	return project;
};

export const updateProjectById = async (
	projectId: string,
	projectData: Partial<Project>,
) => {
	const result = await db
		.update(projects)
		.set({
			...projectData,
		})
		.where(eq(projects.projectId, projectId))
		.returning()
		.then((res) => res[0]);

	return result;
};

export const validUniqueServerAppName = async (appName: string) => {
	const query = await db.query.environments.findMany({
		columns: { environmentId: true },
		with: {
			applications: {
				where: eq(applications.appName, appName),
				columns: {
					appName: true,
				},
			},
			libsql: {
				where: eq(libsql.appName, appName),
				columns: {
					appName: true,
				},
			},
			mariadb: {
				where: eq(mariadb.appName, appName),
				columns: {
					appName: true,
				},
			},
			mongo: {
				where: eq(mongo.appName, appName),
				columns: {
					appName: true,
				},
			},
			mysql: {
				where: eq(mysql.appName, appName),
				columns: {
					appName: true,
				},
			},
			postgres: {
				where: eq(postgres.appName, appName),
				columns: {
					appName: true,
				},
			},
			redis: {
				where: eq(redis.appName, appName),
				columns: {
					appName: true,
				},
			},
		},
	});

	// Filter out items with non-empty fields
	const nonEmptyProjects = query.filter(
		(project) =>
			project.applications.length > 0 ||
			project.libsql.length > 0 ||
			project.mariadb.length > 0 ||
			project.mongo.length > 0 ||
			project.mysql.length > 0 ||
			project.postgres.length > 0 ||
			project.redis.length > 0,
	);

	return nonEmptyProjects.length === 0;
};
