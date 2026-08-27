import {
	ContainerFilesystemError,
	findApplicationById,
	findComposeById,
	findMariadbById,
	findMongoById,
	findMySqlById,
	findPostgresById,
	findRedisById,
	getApplicationFilesystemContainer,
	getApplicationFilesystemContainers,
	getComposeFilesystemContainer,
	getComposeFilesystemContainers,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";

type FilesystemContext = {
	user: { id: string };
	session: { activeOrganizationId: string };
};

export type FilesystemAction = "read" | "write";

export const FILESYSTEM_SERVICE_TYPES = [
	"application",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"compose",
] as const;

export type FilesystemServiceType = (typeof FILESYSTEM_SERVICE_TYPES)[number];

const finders = {
	application: findApplicationById,
	postgres: findPostgresById,
	mysql: findMySqlById,
	mariadb: findMariadbById,
	mongo: findMongoById,
	redis: findRedisById,
	compose: findComposeById,
} satisfies Record<FilesystemServiceType, (id: string) => Promise<unknown>>;

type FilesystemService = Awaited<ReturnType<(typeof finders)[FilesystemServiceType]>> & {
	appName: string;
	serverId?: string | null;
	composeType?: "docker-compose" | "stack";
	environment: { project: { organizationId: string } };
};

export const getAuthorizedServiceFilesystem = async (
	ctx: FilesystemContext,
	serviceType: FilesystemServiceType,
	serviceId: string,
	actions: FilesystemAction[] = ["read"],
): Promise<FilesystemService> => {
	await checkServicePermissionAndAccess(ctx, serviceId, {
		containerFilesystem: actions,
	});

	const finder = finders[serviceType];
	const service = (await finder(serviceId)) as FilesystemService;

	if (
		service.environment.project.organizationId !==
		ctx.session.activeOrganizationId
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this service.",
		});
	}

	return service;
};

export const listServiceFilesystemContainers = async (
	ctx: FilesystemContext,
	serviceType: FilesystemServiceType,
	serviceId: string,
) => {
	const service = await getAuthorizedServiceFilesystem(
		ctx,
		serviceType,
		serviceId,
	);

	if (serviceType === "compose") {
		return await getComposeFilesystemContainers(
			service.appName,
			service.composeType ?? "docker-compose",
			service.serverId,
		);
	}

	const containers = await getApplicationFilesystemContainers(
		service.appName,
		service.serverId,
	);
	return { containers, expectedRunningCount: undefined as number | undefined };
};

export const getAuthorizedServiceFilesystemContainer = async (
	ctx: FilesystemContext,
	serviceType: FilesystemServiceType,
	serviceId: string,
	containerId: string,
	actions: FilesystemAction[] = ["read"],
) => {
	const service = await getAuthorizedServiceFilesystem(
		ctx,
		serviceType,
		serviceId,
		actions,
	);

	const resolved =
		serviceType === "compose"
			? await getComposeFilesystemContainer(
					service.appName,
					service.composeType ?? "docker-compose",
					containerId,
					service.serverId,
				)
			: await getApplicationFilesystemContainer(
					service.appName,
					containerId,
					service.serverId,
				);

	return { service, ...resolved };
};

export const toFilesystemTRPCError = (error: unknown): never => {
	if (error instanceof TRPCError) {
		throw error;
	}

	if (error instanceof ContainerFilesystemError) {
		throw new TRPCError({
			code: error.code === "CONTAINER_NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST",
			message: error.message,
			cause: error,
		});
	}

	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "Unable to access the container file system.",
		cause: error,
	});
};
