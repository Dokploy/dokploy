import { db } from "@dokploy/server/db";
import { member, organizationRole } from "@dokploy/server/db/schema";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
	ac,
	adminRole,
	enterpriseOnlyResources,
	memberRole,
	ownerRole,
	statements,
} from "../lib/access-control";

type Statements = typeof statements;
type Resource = keyof Statements;
type Action<R extends Resource> = Statements[R][number];
type Permissions = {
	[R in Resource]?: Action<R>[];
};

export type PermissionCtx = {
	user: { id: string };
	session: { activeOrganizationId: string };
};

export type ResolvedPermissions = {
	[R in Resource]: {
		[A in Statements[R][number]]: boolean;
	};
};

const staticRoles: Record<string, ReturnType<typeof ac.newRole>> = {
	owner: ownerRole,
	admin: adminRole,
	member: memberRole,
};

const resolveRole = async (
	roleName: string,
	organizationId: string,
): Promise<ReturnType<typeof ac.newRole> | null> => {
	if (staticRoles[roleName]) {
		return staticRoles[roleName];
	}

	const licensed = await hasValidLicense(organizationId);
	if (!licensed) {
		return null;
	}

	const customRoles = await db.query.organizationRole.findMany({
		where: and(
			eq(organizationRole.organizationId, organizationId),
			eq(organizationRole.role, roleName),
		),
	});

	if (customRoles.length === 0) {
		return null;
	}

	const merged: Record<string, string[]> = {};
	for (const entry of customRoles) {
		const parsed = JSON.parse(entry.permission) as Record<string, string[]>;
		for (const [resource, actions] of Object.entries(parsed)) {
			merged[resource] = [
				...new Set([...(merged[resource] ?? []), ...actions]),
			];
		}
	}

	return ac.newRole(merged as any);
};

export const checkPermission = async (
	ctx: PermissionCtx,
	permissions: Permissions,
) => {
	const { id: userId } = ctx.user;
	const { activeOrganizationId: organizationId } = ctx.session;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	const isStaticRole = memberRecord.role in staticRoles;

	if (isStaticRole) {
		const allEnterprise = Object.keys(permissions).every((r) =>
			enterpriseOnlyResources.has(r),
		);
		if (allEnterprise) return;
	}

	const role = await resolveRole(memberRecord.role, organizationId);

	if (!role) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Invalid role",
		});
	}

	const result = role.authorize(permissions);
	if (result.success) {
		return;
	}

	if (memberRecord.role === "member") {
		const overrides = getLegacyOverrides(memberRecord);
		const allGranted = Object.entries(permissions).every(
			([resource, actions]) =>
				(actions as string[]).every(
					(action) =>
						!!(overrides[resource] as Record<string, boolean> | undefined)?.[
							action
						],
				),
		);
		if (allGranted) {
			return;
		}
	}

	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: result.error || "Permission denied",
	});
};

export const hasPermission = async (
	ctx: PermissionCtx,
	permissions: Permissions,
): Promise<boolean> => {
	try {
		await checkPermission(ctx, permissions);
		return true;
	} catch {
		return false;
	}
};

const getLegacyOverrides = (
	memberRecord: Awaited<ReturnType<typeof findMemberByUserId>>,
): Partial<Record<string, Record<string, boolean>>> => {
	return {
		project: {
			create: !!memberRecord.canCreateProjects,
			delete: !!memberRecord.canDeleteProjects,
		},
		service: {
			create: !!memberRecord.canCreateServices,
			delete: !!memberRecord.canDeleteServices,
		},
		environment: {
			create: !!memberRecord.canCreateEnvironments,
			delete: !!memberRecord.canDeleteEnvironments,
		},
		traefikFiles: {
			read: !!memberRecord.canAccessToTraefikFiles,
		},
		docker: {
			read: !!memberRecord.canAccessToDocker,
		},
		api: {
			read: !!memberRecord.canAccessToAPI,
		},
		sshKeys: {
			read: !!memberRecord.canAccessToSSHKeys,
		},
		gitProviders: {
			read: !!memberRecord.canAccessToGitProviders,
		},
	};
};

export const resolvePermissions = async (
	ctx: PermissionCtx,
): Promise<ResolvedPermissions> => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	const role = await resolveRole(memberRecord.role, organizationId);

	const legacyOverrides =
		memberRecord.role === "member" ? getLegacyOverrides(memberRecord) : {};

	const isPrivilegedRole =
		memberRecord.role === "owner" || memberRecord.role === "admin";
	const result = {} as ResolvedPermissions;

	for (const [resource, actions] of Object.entries(statements)) {
		const resourcePerms = {} as Record<string, boolean>;
		for (const action of actions) {
			if (isPrivilegedRole && enterpriseOnlyResources.has(resource)) {
				resourcePerms[action] = true;
				continue;
			}
			if (!role) {
				resourcePerms[action] = false;
				continue;
			}
			const check = role.authorize({ [resource]: [action] });
			resourcePerms[action] =
				check.success ||
				!!(legacyOverrides[resource] as Record<string, boolean> | undefined)?.[
					action
				];
		}
		(result as any)[resource] = resourcePerms;
	}

	return result;
};

export const checkProjectAccess = async (
	ctx: PermissionCtx,
	action: "create" | "delete",
	projectId?: string,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	await checkPermission(ctx, { project: [action] });

	if (
		action !== "create" &&
		projectId &&
		memberRecord.role !== "owner" &&
		memberRecord.role !== "admin"
	) {
		if (!memberRecord.accessedProjects.includes(projectId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this project",
			});
		}
	}
};

export const checkServicePermissionAndAccess = async (
	ctx: PermissionCtx,
	serviceId: string,
	permissions: Permissions,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	await checkPermission(ctx, permissions);
	if (memberRecord.role !== "owner" && memberRecord.role !== "admin") {
		if (!memberRecord.accessedServices.includes(serviceId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this service",
			});
		}
	}
};

export const checkServiceAccess = async (
	ctx: PermissionCtx,
	serviceId: string,
	action: "create" | "read" | "delete" = "read",
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	await checkPermission(ctx, { service: [action] });

	if (memberRecord.role !== "owner" && memberRecord.role !== "admin") {
		if (action === "create") {
			if (!memberRecord.accessedProjects.includes(serviceId)) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have access to this project",
				});
			}
		} else {
			if (!memberRecord.accessedServices.includes(serviceId)) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have access to this service",
				});
			}
		}
	}
};

export const checkEnvironmentAccess = async (
	ctx: PermissionCtx,
	environmentId: string,
	action: "read" | "create" | "delete" = "read",
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	await checkPermission(ctx, { environment: [action] });

	if (
		action !== "create" &&
		memberRecord.role !== "owner" &&
		memberRecord.role !== "admin"
	) {
		if (!memberRecord.accessedEnvironments.includes(environmentId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this environment",
			});
		}
	}
};

export const checkEnvironmentCreationPermission = async (
	ctx: PermissionCtx,
	projectId: string,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	await checkPermission(ctx, { environment: ["create"] });

	if (memberRecord.role !== "owner" && memberRecord.role !== "admin") {
		if (!memberRecord.accessedProjects.includes(projectId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this project",
			});
		}
	}
};

export const checkEnvironmentDeletionPermission = async (
	ctx: PermissionCtx,
	projectId: string,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	await checkPermission(ctx, { environment: ["delete"] });

	if (memberRecord.role !== "owner" && memberRecord.role !== "admin") {
		if (!memberRecord.accessedProjects.includes(projectId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this project",
			});
		}
	}
};

export const addNewProject = async (ctx: PermissionCtx, projectId: string) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	await db
		.update(member)
		.set({
			accessedProjects: [...memberRecord.accessedProjects, projectId],
		})
		.where(
			and(
				eq(member.id, memberRecord.id),
				eq(member.organizationId, organizationId),
			),
		);
};

export const addNewEnvironment = async (
	ctx: PermissionCtx,
	environmentId: string,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	await db
		.update(member)
		.set({
			accessedEnvironments: [
				...memberRecord.accessedEnvironments,
				environmentId,
			],
		})
		.where(
			and(
				eq(member.id, memberRecord.id),
				eq(member.organizationId, organizationId),
			),
		);
};

export const addNewService = async (ctx: PermissionCtx, serviceId: string) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	await db
		.update(member)
		.set({
			accessedServices: [...memberRecord.accessedServices, serviceId],
		})
		.where(
			and(
				eq(member.id, memberRecord.id),
				eq(member.organizationId, organizationId),
			),
		);
};

export const findMemberByUserId = async (
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
