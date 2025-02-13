import { db } from "@dokploy/server/db";
import type { users_temp } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type User = typeof users_temp.$inferSelect;

export const findUserById = async (userId: string) => {
	const userR = await db.query.user.findFirst({
		where: eq(user.userId, userId),
	});
	if (!userR) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "User not found",
		});
	}
	return user;
};

export const findUserByAuthId = async (authId: string) => {
	const userR = await db.query.user.findFirst({
		where: eq(user.id, authId),
		with: {},
	});
	if (!userR) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "User not found",
		});
	}
	return userR;
};

export const findUsers = async (adminId: string) => {
	const currentUsers = await db.query.user.findMany({
		where: eq(user.adminId, adminId),
		with: {
			auth: {
				columns: {
					secret: false,
				},
			},
		},
	});
	return currentUsers;
};

export const addNewProject = async (authId: string, projectId: string) => {
	const userR = await findUserByAuthId(authId);

	await db
		.update(user)
		.set({
			accessedProjects: [...userR.accessedProjects, projectId],
		})
		.where(eq(user.authId, authId));
};

export const addNewService = async (authId: string, serviceId: string) => {
	const userR = await findUserByAuthId(authId);
	await db
		.update(user)
		.set({
			accessedServices: [...userR.accessedServices, serviceId],
		})
		.where(eq(user.authId, authId));
};

export const canPerformCreationService = async (
	userId: string,
	projectId: string,
) => {
	const { accessedProjects, canCreateServices } =
		await findUserByAuthId(userId);
	const haveAccessToProject = accessedProjects.includes(projectId);

	if (canCreateServices && haveAccessToProject) {
		return true;
	}

	return false;
};

export const canPerformAccessService = async (
	userId: string,
	serviceId: string,
) => {
	const { accessedServices } = await findUserByAuthId(userId);
	const haveAccessToService = accessedServices.includes(serviceId);

	if (haveAccessToService) {
		return true;
	}

	return false;
};

export const canPeformDeleteService = async (
	authId: string,
	serviceId: string,
) => {
	const { accessedServices, canDeleteServices } =
		await findUserByAuthId(authId);
	const haveAccessToService = accessedServices.includes(serviceId);

	if (canDeleteServices && haveAccessToService) {
		return true;
	}

	return false;
};

export const canPerformCreationProject = async (authId: string) => {
	const { canCreateProjects } = await findUserByAuthId(authId);

	if (canCreateProjects) {
		return true;
	}

	return false;
};

export const canPerformDeleteProject = async (authId: string) => {
	const { canDeleteProjects } = await findUserByAuthId(authId);

	if (canDeleteProjects) {
		return true;
	}

	return false;
};

export const canPerformAccessProject = async (
	authId: string,
	projectId: string,
) => {
	const { accessedProjects } = await findUserByAuthId(authId);

	const haveAccessToProject = accessedProjects.includes(projectId);

	if (haveAccessToProject) {
		return true;
	}
	return false;
};

export const canAccessToTraefikFiles = async (authId: string) => {
	const { canAccessToTraefikFiles } = await findUserByAuthId(authId);
	return canAccessToTraefikFiles;
};

export const checkServiceAccess = async (
	authId: string,
	serviceId: string,
	action = "access" as "access" | "create" | "delete",
) => {
	let hasPermission = false;
	switch (action) {
		case "create":
			hasPermission = await canPerformCreationService(authId, serviceId);
			break;
		case "access":
			hasPermission = await canPerformAccessService(authId, serviceId);
			break;
		case "delete":
			hasPermission = await canPeformDeleteService(authId, serviceId);
			break;
		default:
			hasPermission = false;
	}
	if (!hasPermission) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Permission denied",
		});
	}
};

export const checkProjectAccess = async (
	authId: string,
	action: "create" | "delete" | "access",
	projectId?: string,
) => {
	let hasPermission = false;
	switch (action) {
		case "access":
			hasPermission = await canPerformAccessProject(
				authId,
				projectId as string,
			);
			break;
		case "create":
			hasPermission = await canPerformCreationProject(authId);
			break;
		case "delete":
			hasPermission = await canPerformDeleteProject(authId);
			break;
		default:
			hasPermission = false;
	}
	if (!hasPermission) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Permission denied",
		});
	}
};
