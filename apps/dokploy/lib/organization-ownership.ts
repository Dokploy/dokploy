import { TRPCError } from "@trpc/server";

interface TransferOwnershipInput {
	activeOrganizationId?: string | null;
	organizationOwnerId: string;
	currentUserId: string;
	currentOwnerMemberId?: string | null;
	targetUserId: string;
	targetOrganizationId: string;
}

export const assertCanTransferOwnership = ({
	activeOrganizationId,
	organizationOwnerId,
	currentUserId,
	currentOwnerMemberId,
	targetUserId,
	targetOrganizationId,
}: TransferOwnershipInput) => {
	if (!activeOrganizationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "No active organization selected",
		});
	}

	if (organizationOwnerId !== currentUserId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only the organization owner can transfer ownership",
		});
	}

	if (!currentOwnerMemberId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Current owner membership not found",
		});
	}

	if (targetOrganizationId !== activeOrganizationId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not allowed to transfer ownership to this member",
		});
	}

	if (targetUserId === currentUserId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You cannot transfer ownership to yourself",
		});
	}
};
