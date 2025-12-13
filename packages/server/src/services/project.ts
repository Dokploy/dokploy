import { db } from "@dokploy/server/db";
import {
	type apiCreateProject,
	applications,
	mariadb,
	mongo,
	mysql,
	postgres,
	projects,
	redis,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createProductionEnvironment } from "./environment";

export type Project = typeof projects.$inferSelect;

export const createProject = async (
	input: typeof apiCreateProject._type,
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

export const findProjectById = async (projectId: string) => {
	const project = await db.query.projects.findFirst({
		where: eq(projects.projectId, projectId),
		with: {
			organization: true,
			environments: {
				with: {
					applications: true,
					mariadb: true,
					mongo: true,
					mysql: true,
					postgres: true,
					redis: true,
					compose: true,
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

/**
 * Get the effective wildcard domain for a project.
 * Returns the project's wildcard domain if set, otherwise falls back to
 * the organization's wildcard domain if useOrganizationWildcard is true.
 * Returns null if no custom wildcard domain is configured.
 */
export const getProjectWildcardDomain = async (
	projectId: string,
): Promise<string | null> => {
	const project = await db.query.projects.findFirst({
		where: eq(projects.projectId, projectId),
		with: {
			organization: true,
		},
	});

	if (!project) {
		return null;
	}

	// If the project has its own wildcard domain, use it
	if (project.wildcardDomain) {
		return project.wildcardDomain;
	}

	// If the project should inherit from organization, return organization's wildcard
	if (project.useOrganizationWildcard && project.organization?.wildcardDomain) {
		return project.organization.wildcardDomain;
	}

	return null;
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
		with: {
			applications: {
				where: eq(applications.appName, appName),
			},
			mariadb: {
				where: eq(mariadb.appName, appName),
			},
			mongo: {
				where: eq(mongo.appName, appName),
			},
			mysql: {
				where: eq(mysql.appName, appName),
			},
			postgres: {
				where: eq(postgres.appName, appName),
			},
			redis: {
				where: eq(redis.appName, appName),
			},
		},
	});

	// Filter out items with non-empty fields
	const nonEmptyProjects = query.filter(
		(project) =>
			project.applications.length > 0 ||
			project.mariadb.length > 0 ||
			project.mongo.length > 0 ||
			project.mysql.length > 0 ||
			project.postgres.length > 0 ||
			project.redis.length > 0,
	);

	return nonEmptyProjects.length === 0;
};
