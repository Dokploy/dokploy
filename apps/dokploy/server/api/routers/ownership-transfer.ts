import {
	acceptOwnershipTransfer,
	cancelOwnershipTransfer,
	createOwnershipTransfer,
	declineOwnershipTransfer,
	findCredentialAccount,
	findIncomingTransfer,
	findOwnedOrganizations,
	findPendingOutgoingTransfer,
	isInstanceOwner,
	listTransferRecipients,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { audit } from "@/server/api/utils/audit";
import { apiCreateOwnershipTransfer } from "@/server/db/schema";
import {
	createTRPCRouter,
	instanceOwnerProcedure,
	selfHostedProcedure,
} from "../trpc";

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
			findPendingOutgoingTransfer(),
		]);

		return { isInstanceOwner: true, ownedOrganizations, pending };
	}),
	recipients: instanceOwnerProcedure.query(async ({ ctx }) => {
		return listTransferRecipients(ctx.user.id);
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
				resourceName: input.email,
				metadata: { type: "ownershipTransferInvite" },
			});
			return created;
		}),
	cancel: instanceOwnerProcedure.mutation(async ({ ctx }) => {
		await cancelOwnershipTransfer();

		await audit(ctx, {
			action: "cancel",
			resourceType: "organization",
			metadata: { type: "ownershipTransferInvite" },
		});
		return true;
	}),
	incoming: selfHostedProcedure.query(async ({ ctx }) => {
		return findIncomingTransfer(ctx.user.id);
	}),
	accept: selfHostedProcedure.mutation(async ({ ctx }) => {
		return acceptOwnershipTransfer(ctx.user.id);
	}),
	decline: selfHostedProcedure.mutation(async ({ ctx }) => {
		await declineOwnershipTransfer(ctx.user.id);
		return true;
	}),
});
