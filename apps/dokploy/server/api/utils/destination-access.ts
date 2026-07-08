import { findDestinationById } from "@dokploy/server/services/destination";
import { TRPCError } from "@trpc/server";

export const assertDestinationAccess = async (
	destinationId: string,
	organizationId: string,
) => {
	const destination = await findDestinationById(destinationId);
	if (destination.organizationId !== organizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this destination.",
		});
	}

	return destination;
};
