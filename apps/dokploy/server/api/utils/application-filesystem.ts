import {
	ContainerFilesystemError,
	findApplicationById,
	getApplicationFilesystemContainer,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";

type FilesystemContext = {
	user: { id: string };
	session: { activeOrganizationId: string };
};

export const getAuthorizedApplicationFilesystem = async (
	ctx: FilesystemContext,
	applicationId: string,
) => {
	await checkServicePermissionAndAccess(ctx, applicationId, {
		containerFilesystem: ["read"],
	});

	const application = await findApplicationById(applicationId);
	if (
		application.environment.project.organizationId !==
		ctx.session.activeOrganizationId
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this application.",
		});
	}

	return application;
};

export const getAuthorizedApplicationFilesystemContainer = async (
	ctx: FilesystemContext,
	applicationId: string,
	containerId: string,
) => {
	const application = await getAuthorizedApplicationFilesystem(
		ctx,
		applicationId,
	);
	const resolved = await getApplicationFilesystemContainer(
		application.appName,
		containerId,
		application.serverId,
	);

	return { application, ...resolved };
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
