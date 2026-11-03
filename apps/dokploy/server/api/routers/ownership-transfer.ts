import {
	acceptOwnershipTransfer,
	cancelOwnershipTransfer,
	createOwnershipTransfer,
	declineOwnershipTransfer,
	findCredentialAccount,
	findIncomingTransfers,
	findOwnedOrganizations,
	findOwnershipTransferById,
	findPendingOutgoingTransfer,
	findTransferRecipient,
	IS_CLOUD,
	isInstanceOwner,
	searchTransferRecipients,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { audit } from "@/server/api/utils/audit";
import {
	apiCheckTransferRecipient,
	apiCreateOwnershipTransfer,
	apiFindOwnershipTransfer,
	apiSearchTransferRecipients,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const selfHostedProcedure = protectedProcedure.use(({ next }) => {
	if (IS_CLOUD) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Ownership transfer is only available on self-hosted",
		});
	}
	return next();
});

const instanceOwnerProcedure = selfHostedProcedure.use(
	async ({ ctx, next }) => {
		if (!(await isInstanceOwner(ctx.user.id))) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Only the instance owner can transfer ownership",
			});
		}
		return next();
	},
);

export const ownershipTransferRouter = createTRPCRouter({
	status: selfHostedProcedure.query(async ({ ctx }) => {
		if (!(await isInstanceOwner(ctx.user.id))) {
			return {
				isInstanceOwner: false,
				ownedOrganizations: [],
				pending: null,
			};
		}

		const [ownedOrganizations, pending] = await Promise.all([
			findOwnedOrganizations(ctx.user.id),
			findPendingOutgoingTransfer(ctx.user.id),
		]);

		return {
			isInstanceOwner: true,
			ownedOrganizations,
			pending: pending ?? null,
		};
	}),
	searchRecipients: instanceOwnerProcedure
		.input(apiSearchTransferRecipients)
		.query(async ({ ctx, input }) => {
			return searchTransferRecipients(ctx.user.id, input.query);
		}),
	checkRecipient: instanceOwnerProcedure
		.input(apiCheckTransferRecipient)
		.query(async ({ ctx, input }) => {
			return findTransferRecipient(ctx.user.id, input.email);
		}),
	create: instanceOwnerProcedure
		.input(apiCreateOwnershipTransfer)
		.mutation(async ({ ctx, input }) => {
			const credential = await findCredentialAccount(ctx.user.id);
			if (!credential?.password) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Your account has no password. Run the transfer-ownership command on the server instead.",
				});
			}
			if (!bcrypt.compareSync(input.password, credential.password)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "The password is incorrect",
				});
			}

			const created = await createOwnershipTransfer(ctx.user.id, input.email);

			await audit(ctx, {
				action: "create",
				resourceType: "organization",
				resourceId: created?.id,
				resourceName: input.email,
				metadata: { type: "ownershipTransferInvite" },
			});
			return created;
		}),
	cancel: instanceOwnerProcedure
		.input(apiFindOwnershipTransfer)
		.mutation(async ({ ctx, input }) => {
			await cancelOwnershipTransfer(input.transferId, ctx.user.id);

			await audit(ctx, {
				action: "cancel",
				resourceType: "organization",
				resourceId: input.transferId,
				metadata: { type: "ownershipTransferInvite" },
			});
			return true;
		}),
	incoming: selfHostedProcedure.query(async ({ ctx }) => {
		return findIncomingTransfers(ctx.user.id);
	}),
	one: selfHostedProcedure
		.input(apiFindOwnershipTransfer)
		.query(async ({ ctx, input }) => {
			const transfer = await findOwnershipTransferById(input.transferId);

			if (
				transfer.toUserId !== ctx.user.id &&
				transfer.fromUserId !== ctx.user.id
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "This ownership transfer is not addressed to you",
				});
			}

			return {
				...transfer,
				isRecipient: transfer.toUserId === ctx.user.id,
				organizations: await findOwnedOrganizations(transfer.fromUserId),
			};
		}),
	accept: selfHostedProcedure
		.input(apiFindOwnershipTransfer)
		.mutation(async ({ ctx, input }) => {
			return acceptOwnershipTransfer(input.transferId, ctx.user.id);
		}),
	decline: selfHostedProcedure
		.input(apiFindOwnershipTransfer)
		.mutation(async ({ ctx, input }) => {
			await declineOwnershipTransfer(input.transferId, ctx.user.id);
			return true;
		}),
});
