import type { DeploymentOwner } from "@dokploy/server/services/deployment";
import {
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";

type Ctx = Parameters<typeof checkServicePermissionAndAccess>[0];

const getOwningServiceId = (deployment: DeploymentOwner) => {
	const { backup, volumeBackup, schedule } = deployment;
	return (
		deployment.applicationId ??
		deployment.composeId ??
		deployment.previewDeployment?.applicationId ??
		schedule?.applicationId ??
		schedule?.composeId ??
		backup?.postgresId ??
		backup?.mysqlId ??
		backup?.mariadbId ??
		backup?.mongoId ??
		backup?.libsqlId ??
		backup?.composeId ??
		volumeBackup?.applicationId ??
		volumeBackup?.postgresId ??
		volumeBackup?.mysqlId ??
		volumeBackup?.mariadbId ??
		volumeBackup?.mongoId ??
		volumeBackup?.redisId ??
		volumeBackup?.libsqlId ??
		volumeBackup?.composeId ??
		null
	);
};

export const assertDeploymentAccess = async (
	ctx: Ctx,
	deployment: DeploymentOwner | undefined,
	action: "read" | "cancel",
) => {
	if (!deployment) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Deployment not found" });
	}
	const serviceId = getOwningServiceId(deployment);
	if (serviceId) {
		await checkServicePermissionAndAccess(ctx, serviceId, {
			deployment: [action],
		});
		return;
	}
	const organizationId =
		deployment.server?.organizationId ??
		deployment.schedule?.server?.organizationId ??
		deployment.schedule?.organizationId ??
		deployment.backup?.destination?.organizationId ??
		null;
	const member = await findMemberByUserId(
		ctx.user.id,
		ctx.session.activeOrganizationId,
	);
	if (
		organizationId !== ctx.session.activeOrganizationId ||
		(member.role !== "owner" && member.role !== "admin")
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this deployment.",
		});
	}
};
