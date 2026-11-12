import {
	checkServiceAccess,
	hasPermission,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import {
	containerBelongsToService,
	findServiceAppName,
} from "@/server/wss/container-ownership";

type Ctx = Parameters<typeof checkServiceAccess>[0];

export const assertMonitoringAccess = async (
	ctx: Ctx,
	appName: string,
	serviceId?: string,
) => {
	if (await hasPermission(ctx, { docker: ["read"] })) return;

	if (serviceId) {
		await checkServiceAccess(ctx, serviceId, "read");
		const serviceAppName = await findServiceAppName(serviceId);
		if (
			appName === serviceAppName ||
			(await containerBelongsToService(serviceId, appName))
		) {
			return;
		}
	}

	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: "You don't have access to this service's monitoring",
	});
};
