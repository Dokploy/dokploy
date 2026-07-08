import {
	findApplicationById,
	findComposeById,
	findEnvironmentById,
	findLibsqlById,
	findMariadbById,
	findMongoById,
	findMySqlById,
	findPostgresById,
	findProjectById,
	findRedisById,
	getAccessibleServerIds,
	type Project,
} from "@dokploy/server";
import { findMemberByUserId } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";

type PlacementAccessCtx = {
	session: {
		userId: string;
		activeOrganizationId: string;
	};
	user: {
		id: string;
		role: string;
	};
};

const serviceFinders = {
	application: findApplicationById,
	compose: findComposeById,
	libsql: findLibsqlById,
	mariadb: findMariadbById,
	mongo: findMongoById,
	mysql: findMySqlById,
	postgres: findPostgresById,
	redis: findRedisById,
} as const;

export type PlacementServiceType = keyof typeof serviceFinders;

const isPrivilegedRole = (role: string) => role === "owner" || role === "admin";

const assertProjectMembership = async (
	ctx: PlacementAccessCtx,
	project: Project,
) => {
	if (project.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this project",
		});
	}

	const member = await findMemberByUserId(
		ctx.user.id,
		ctx.session.activeOrganizationId,
	);
	if (isPrivilegedRole(member.role)) {
		return member;
	}

	if (!member.accessedProjects.includes(project.projectId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this project",
		});
	}

	return member;
};

export const assertTargetProjectAccess = async (
	ctx: PlacementAccessCtx,
	projectId: string,
) => {
	const project = await findProjectById(projectId);
	await assertProjectMembership(ctx, project);
	return project;
};

export const assertTargetEnvironmentAccess = async (
	ctx: PlacementAccessCtx,
	environmentId: string,
) => {
	const environment = await findEnvironmentById(environmentId);
	const member = await assertProjectMembership(ctx, environment.project);
	if (
		!isPrivilegedRole(member.role) &&
		!member.accessedEnvironments.includes(environment.environmentId)
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this environment",
		});
	}

	return environment;
};

export const assertTargetServerAccess = async (
	ctx: PlacementAccessCtx,
	serverId?: string,
) => {
	if (!serverId) {
		return;
	}

	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
};

export const assertServicePlacementAccess = async (
	ctx: PlacementAccessCtx,
	serviceId: string,
	serviceType: PlacementServiceType,
	options?: {
		sourceEnvironmentId?: string;
	},
) => {
	const service = await serviceFinders[serviceType](serviceId);

	if (
		options?.sourceEnvironmentId &&
		service.environmentId !== options.sourceEnvironmentId
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this service",
		});
	}

	const member = await assertProjectMembership(
		ctx,
		service.environment.project,
	);
	if (
		!isPrivilegedRole(member.role) &&
		!member.accessedServices.includes(serviceId)
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this service",
		});
	}

	return service;
};
