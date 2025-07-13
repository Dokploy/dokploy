import { db } from "@dokploy/server/db";
import { apikey, member, users } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { PERMISSIONS } from "../lib/permissions";

export type User = typeof users.$inferSelect;

export const addNewProject = async (
	userId: string,
	projectId: string,
	organizationId: string,
) => {
	const userR = await findMemberById(userId, organizationId);

	await db
		.update(member)
		.set({
			accessedProjects: [...userR.accessedProjects, projectId],
		})
		.where(
			and(eq(member.id, userR.id), eq(member.organizationId, organizationId)),
		);
};

export const addNewService = async (
	userId: string,
	serviceId: string,
	organizationId: string,
) => {
	const userR = await findMemberById(userId, organizationId);
	await db
		.update(member)
		.set({
			accessedServices: [...userR.accessedServices, serviceId],
		})
		.where(
			and(eq(member.id, userR.id), eq(member.organizationId, organizationId)),
		);
};

export const canPerformCreationService = async (
	userId: string,
	projectId: string,
	organizationId: string,
) => {
	const { accessedProjects, role } = await findMemberById(
		userId,
		organizationId,
	);
	const haveAccessToProject = accessedProjects.includes(projectId);

	if (
		role?.permissions?.includes(PERMISSIONS.SERVICE.CREATE.name) &&
		haveAccessToProject
	) {
		return true;
	}

	return false;
};

export const canPerformAccessService = async (
	userId: string,
	serviceId: string,
	organizationId: string,
) => {
	const { accessedServices } = await findMemberById(userId, organizationId);
	const haveAccessToService = accessedServices.includes(serviceId);

	if (haveAccessToService) {
		return true;
	}

	return false;
};

export const canPeformDeleteService = async (
	userId: string,
	serviceId: string,
	organizationId: string,
) => {
	const { accessedServices, role } = await findMemberById(
		userId,
		organizationId,
	);
	const haveAccessToService = accessedServices.includes(serviceId);

	if (
		role?.permissions?.includes(PERMISSIONS.SERVICE.DELETE.name) &&
		haveAccessToService
	) {
		return true;
	}

	return false;
};

export const canPerformCreationProject = async (
	userId: string,
	organizationId: string,
) => {
	const { role } = await findMemberById(userId, organizationId);

	if (role?.permissions?.includes(PERMISSIONS.PROJECT.CREATE.name)) {
		return true;
	}

	return false;
};

export const canPerformDeleteProject = async (
	userId: string,
	organizationId: string,
) => {
	const { role } = await findMemberById(userId, organizationId);

	if (role?.permissions?.includes(PERMISSIONS.PROJECT.DELETE.name)) {
		return true;
	}

	return false;
};

export const canPerformAccessProject = async (
	userId: string,
	projectId: string,
	organizationId: string,
) => {
	const { accessedProjects } = await findMemberById(userId, organizationId);

	const haveAccessToProject = accessedProjects.includes(projectId);

	if (haveAccessToProject) {
		return true;
	}
	return false;
};

export const canAccessToTraefikFiles = async (
	userId: string,
	organizationId: string,
) => {
	const { role } = await findMemberById(userId, organizationId);
	return role?.permissions?.includes(PERMISSIONS.TRAEFIK.ACCESS.name);
};

export const checkServiceAccess = async (
	userId: string,
	serviceId: string,
	organizationId: string,
	action = "access" as "access" | "create" | "delete",
) => {
	let hasPermission = false;
	switch (action) {
		case "create":
			hasPermission = await canPerformCreationService(
				userId,
				serviceId,
				organizationId,
			);
			break;
		case "access":
			hasPermission = await canPerformAccessService(
				userId,
				serviceId,
				organizationId,
			);
			break;
		case "delete":
			hasPermission = await canPeformDeleteService(
				userId,
				serviceId,
				organizationId,
			);
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
	userId: string,
	action: "create" | "delete" | "access",
	organizationId: string,
	projectId?: string,
) => {
	let hasPermission = false;
	switch (action) {
		case "access":
			hasPermission = await canPerformAccessProject(
				userId,
				projectId as string,
				organizationId,
			);
			break;
		case "create":
			hasPermission = await canPerformCreationProject(userId, organizationId);
			break;
		case "delete":
			hasPermission = await canPerformDeleteProject(userId, organizationId);
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

export const findMemberById = async (
	userId: string,
	organizationId: string,
) => {
	const result = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, organizationId),
		),
		with: {
			user: true,
			role: true,
		},
	});

	if (!result) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Permission denied",
		});
	}
	return result;
};

export const updateUser = async (userId: string, userData: Partial<User>) => {
	const user = await db
		.update(users)
		.set({
			...userData,
		})
		.where(eq(users.id, userId))
		.returning()
		.then((res) => res[0]);

	return user;
};

export const createApiKey = async (
	userId: string,
	input: {
		name: string;
		prefix?: string;
		expiresIn?: number;
		metadata: {
			organizationId: string;
		};
		rateLimitEnabled?: boolean;
		rateLimitTimeWindow?: number;
		rateLimitMax?: number;
		remaining?: number;
		refillAmount?: number;
		refillInterval?: number;
	},
) => {
	const apiKey = await auth.createApiKey({
		body: {
			name: input.name,
			expiresIn: input.expiresIn,
			prefix: input.prefix,
			rateLimitEnabled: input.rateLimitEnabled,
			rateLimitTimeWindow: input.rateLimitTimeWindow,
			rateLimitMax: input.rateLimitMax,
			remaining: input.remaining,
			refillAmount: input.refillAmount,
			refillInterval: input.refillInterval,
			userId,
		},
	});

	if (input.metadata) {
		await db
			.update(apikey)
			.set({
				metadata: JSON.stringify(input.metadata),
			})
			.where(eq(apikey.id, apiKey.id));
	}
	return apiKey;
};
