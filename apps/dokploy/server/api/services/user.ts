import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type User = typeof users.$inferSelect;

export const findUserById = async (userId: string) => {
	const user = await db.query.users.findFirst({
		where: eq(users.userId, userId),
	});
	if (!user) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "User not found",
		});
	}
	return user;
};

export const findUserByAuthId = async (authId: string) => {
	const user = await db.query.users.findFirst({
		where: eq(users.authId, authId),
		with: {
			auth: true,
		},
	});
	if (!user) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "User not found",
		});
	}
	return user;
};

export const findUsers = async () => {
	const users = await db.query.users.findMany({
		with: {
			auth: {
				columns: {
					secret: false,
				},
			},
		},
	});
	return users;
};

export const addNewProject = async (authId: string, projectId: string) => {
	const user = await findUserByAuthId(authId);

	await db
		.update(users)
		.set({
			accesedProjects: [...user.accesedProjects, projectId],
		})
		.where(eq(users.authId, authId));
};

export const addNewService = async (authId: string, serviceId: string) => {
	const user = await findUserByAuthId(authId);
	await db
		.update(users)
		.set({
			accesedServices: [...user.accesedServices, serviceId],
		})
		.where(eq(users.authId, authId));
};

export const canPerformCreationService = async (
	userId: string,
	projectId: string,
) => {
	const { accesedProjects, canCreateServices } = await findUserByAuthId(userId);
	const haveAccessToProject = accesedProjects.includes(projectId);

	if (canCreateServices && haveAccessToProject) {
		return true;
	}

	return false;
};

export const canPerformAccessService = async (
	userId: string,
	serviceId: string,
) => {
	const { accesedServices } = await findUserByAuthId(userId);
	const haveAccessToService = accesedServices.includes(serviceId);

	if (haveAccessToService) {
		return true;
	}

	return false;
};

export const canPeformDeleteService = async (
	authId: string,
	serviceId: string,
) => {
	const { accesedServices, canDeleteServices } = await findUserByAuthId(authId);
	const haveAccessToService = accesedServices.includes(serviceId);

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
	const { accesedProjects } = await findUserByAuthId(authId);

	const haveAccessToProject = accesedProjects.includes(projectId);

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
