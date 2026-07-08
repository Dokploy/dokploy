import { findMemberByUserId } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";

type LocalHostAccessCtx = {
	user: { id: string };
	session: { activeOrganizationId: string };
};

export const assertLocalHostAccess = async (ctx: LocalHostAccessCtx) => {
	const member = await findMemberByUserId(
		ctx.user.id,
		ctx.session.activeOrganizationId,
	);
	if (!member || (member.role !== "owner" && member.role !== "admin")) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Local host operations require owner or admin access",
		});
	}
};
