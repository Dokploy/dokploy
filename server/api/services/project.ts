import { db } from "@/server/db";
import { type apiCreateProject, projects } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { findAdmin } from "./admin";

export type Project = typeof projects.$inferSelect;

export const createProject = async (input: typeof apiCreateProject._type) => {
	const admin = await findAdmin();
	const newProject = await db
		.insert(projects)
		.values({
			...input,
			adminId: admin.adminId,
		})
		.returning()
		.then((value) => value[0]);

	if (!newProject) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to create the project",
		});
	}

	return newProject;
};

export const findProjectById = async (projectId: string) => {
	const project = await db.query.projects.findFirst({
		where: eq(projects.projectId, projectId),
		with: {
			applications: true,
			mariadb: true,
			mongo: true,
			mysql: true,
			postgres: true,
			redis: true,
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
