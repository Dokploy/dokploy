import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";

type ServiceEnvironmentContext = Parameters<
	typeof checkServicePermissionAndAccess
>[0] & {
	session: {
		activeOrganizationId: string;
	};
};

type ServiceEnvironmentResource = {
	environment: {
		project: {
			organizationId: string;
		};
	};
};

export const assertServiceEnvironmentReadAccess = async <
	TService extends ServiceEnvironmentResource,
>(
	ctx: ServiceEnvironmentContext,
	serviceId: string,
	findService: () => Promise<TService>,
	resourceName: string,
) => {
	await checkServicePermissionAndAccess(ctx, serviceId, {
		envVars: ["read"],
	});

	const service = await findService();

	if (
		service.environment.project.organizationId !==
		ctx.session.activeOrganizationId
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: `You are not authorized to access this ${resourceName}`,
		});
	}

	return service;
};
