import { getConfig } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	previewDeployments,
	redis,
} from "@dokploy/server/db/schema";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

type LocalDockerAccessCtx = {
	user: { id: string };
	session: { activeOrganizationId: string };
};

export type LocalDockerPermission =
	| "read"
	| "inspect"
	| "execute"
	| "write"
	| "delete";

type DockerInspectConfig = {
	Id?: string;
	Config?: {
		Labels?: Record<string, string> | null;
	} | null;
};

type LocalDockerService = {
	id: string;
	serverId?: string | null;
};

type LocalDockerServicePermissions = Parameters<
	typeof checkServicePermissionAndAccess
>[2];

const dockerIdentifierRegex = /^[a-zA-Z0-9.\-_]+$/;

const unauthorizedLocalDockerTarget = () =>
	new TRPCError({
		code: "UNAUTHORIZED",
		message: "You are not authorized to access this local Docker resource",
	});

const assertDockerIdentifier = (value: string) => {
	if (!dockerIdentifierRegex.test(value)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid Docker resource identifier",
		});
	}
};

const normalizeDockerLabel = (value?: string | null) => {
	const normalized = value?.trim();
	return normalized && dockerIdentifierRegex.test(normalized)
		? normalized
		: null;
};

const getLocalDockerAppName = (config: DockerInspectConfig | undefined) => {
	const labels = config?.Config?.Labels ?? {};

	return (
		normalizeDockerLabel(labels["com.docker.compose.project"]) ??
		normalizeDockerLabel(labels["com.docker.stack.namespace"]) ??
		normalizeDockerLabel(labels["com.docker.swarm.service.name"])
	);
};

const findServiceByAppName = async (
	appName: string,
): Promise<LocalDockerService | null> => {
	const applicationService = await db.query.applications.findFirst({
		where: eq(applications.appName, appName),
		columns: {
			applicationId: true,
			serverId: true,
		},
	});
	if (applicationService) {
		return {
			id: applicationService.applicationId,
			serverId: applicationService.serverId,
		};
	}

	const previewDeployment = await db.query.previewDeployments.findFirst({
		where: eq(previewDeployments.appName, appName),
		with: {
			application: {
				columns: {
					applicationId: true,
					serverId: true,
				},
			},
		},
	});
	if (previewDeployment?.application) {
		return {
			id: previewDeployment.application.applicationId,
			serverId: previewDeployment.application.serverId,
		};
	}

	const composeService = await db.query.compose.findFirst({
		where: eq(compose.appName, appName),
		columns: {
			composeId: true,
			serverId: true,
		},
	});
	if (composeService) {
		return {
			id: composeService.composeId,
			serverId: composeService.serverId,
		};
	}

	const postgresService = await db.query.postgres.findFirst({
		where: eq(postgres.appName, appName),
		columns: {
			postgresId: true,
			serverId: true,
		},
	});
	if (postgresService) {
		return {
			id: postgresService.postgresId,
			serverId: postgresService.serverId,
		};
	}

	const mysqlService = await db.query.mysql.findFirst({
		where: eq(mysql.appName, appName),
		columns: {
			mysqlId: true,
			serverId: true,
		},
	});
	if (mysqlService) {
		return {
			id: mysqlService.mysqlId,
			serverId: mysqlService.serverId,
		};
	}

	const mariadbService = await db.query.mariadb.findFirst({
		where: eq(mariadb.appName, appName),
		columns: {
			mariadbId: true,
			serverId: true,
		},
	});
	if (mariadbService) {
		return {
			id: mariadbService.mariadbId,
			serverId: mariadbService.serverId,
		};
	}

	const mongoService = await db.query.mongo.findFirst({
		where: eq(mongo.appName, appName),
		columns: {
			mongoId: true,
			serverId: true,
		},
	});
	if (mongoService) {
		return {
			id: mongoService.mongoId,
			serverId: mongoService.serverId,
		};
	}

	const redisService = await db.query.redis.findFirst({
		where: eq(redis.appName, appName),
		columns: {
			redisId: true,
			serverId: true,
		},
	});
	if (redisService) {
		return {
			id: redisService.redisId,
			serverId: redisService.serverId,
		};
	}

	const libsqlService = await db.query.libsql.findFirst({
		where: eq(libsql.appName, appName),
		columns: {
			libsqlId: true,
			serverId: true,
		},
	});
	if (libsqlService) {
		return {
			id: libsqlService.libsqlId,
			serverId: libsqlService.serverId,
		};
	}

	return null;
};

const assertLocalDockerServicePermission = async (
	ctx: LocalDockerAccessCtx,
	appName: string,
	permissions: LocalDockerServicePermissions,
) => {
	assertDockerIdentifier(appName);

	const service = await findServiceByAppName(appName);
	if (!service || service.serverId) {
		throw unauthorizedLocalDockerTarget();
	}

	await checkServicePermissionAndAccess(ctx, service.id, permissions);
};

export const assertLocalDockerServiceAccess = async (
	ctx: LocalDockerAccessCtx,
	appName: string,
	permission: LocalDockerPermission,
) =>
	assertLocalDockerServicePermission(ctx, appName, {
		docker: [permission],
	});

export const assertLocalDockerServiceReadAccess = async (
	ctx: LocalDockerAccessCtx,
	appName: string,
) =>
	assertLocalDockerServicePermission(ctx, appName, {
		service: ["read"],
	});

export const assertLocalDockerContainerAccess = async (
	ctx: LocalDockerAccessCtx,
	containerId: string,
	permission: LocalDockerPermission,
) => {
	assertDockerIdentifier(containerId);

	const config = await getConfig(containerId, null);
	const appName = getLocalDockerAppName(config);
	if (!appName) {
		throw unauthorizedLocalDockerTarget();
	}

	await assertLocalDockerServiceAccess(ctx, appName, permission);

	return config;
};
