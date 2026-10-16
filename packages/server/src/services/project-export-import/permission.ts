import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	checkProjectAccess,
	findMemberByUserId,
	type PermissionCtx,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";

export type TransferAction = "export" | "import";

export const assertTransferPermission = async (
	ctx: PermissionCtx,
	projectId: string | undefined,
	action: TransferAction,
) => {
	const memberRecord = await findMemberByUserId(
		ctx.user.id,
		ctx.session.activeOrganizationId,
	);

	if (memberRecord.role !== "owner" && memberRecord.role !== "admin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Only organization owners and admins can ${action} projects`,
		});
	}

	if (projectId) {
		const project = await db.query.projects.findFirst({
			where: (fields, { eq }) => eq(fields.projectId, projectId),
			columns: { organizationId: true },
		});
		if (
			!project ||
			project.organizationId !== ctx.session.activeOrganizationId
		) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
		}
	}

	if (action === "import") {
		await checkProjectAccess(ctx, "create");
	}

	return memberRecord;
};

export const findOrganizationServerId = async (
	serverId: string | undefined,
	organizationId: string,
): Promise<string | null> => {
	if (!serverId) {
		if (IS_CLOUD) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Choose the server the bundle will be imported to",
			});
		}
		return null;
	}
	const server = await db.query.server.findFirst({
		where: (fields, { eq, and }) =>
			and(
				eq(fields.serverId, serverId),
				eq(fields.organizationId, organizationId),
			),
		columns: { serverId: true },
	});
	if (!server) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
	}
	return server.serverId;
};

export const findOrganizationDestination = async (
	destinationId: string,
	organizationId: string,
) => {
	const destination = await db.query.destinations.findFirst({
		where: (fields, { eq, and }) =>
			and(
				eq(fields.destinationId, destinationId),
				eq(fields.organizationId, organizationId),
			),
	});
	if (!destination) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Destination not found",
		});
	}
	return destination;
};
