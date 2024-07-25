import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateSshKey,
	apiFindOneSshKey,
	apiRemoveSshKey,
	apiUpdateSshKey,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	createSshKey,
	findSSHKeyById,
	removeSSHKeyById,
	updateSSHKeyById,
} from "../services/ssh-key";

export const sshRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateSshKey)
		.mutation(async ({ input }) => {
			try {
				await createSshKey(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the ssh key",
					cause: error,
				});
			}
		}),
	remove: adminProcedure.input(apiRemoveSshKey).mutation(async ({ input }) => {
		try {
			return await removeSSHKeyById(input.sshKeyId);
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to delete this ssh key",
			});
		}
	}),
	one: protectedProcedure.input(apiFindOneSshKey).query(async ({ input }) => {
		const sshKey = await findSSHKeyById(input.sshKeyId);
		return sshKey;
	}),
	all: adminProcedure.query(async () => {
		return await db.query.sshKeys.findMany({});
	}),
	update: adminProcedure.input(apiUpdateSshKey).mutation(async ({ input }) => {
		try {
			return await updateSSHKeyById(input);
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to update this ssh key",
				cause: error,
			});
		}
	}),
});
