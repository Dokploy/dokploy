import { TRPCError } from "@trpc/server";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import {
	apiCreateSshKey,
	apiFindOneSshKey,
	apiGenerateSSHKey,
	apiRemoveSshKey,
	apiUpdateSshKey,
} from "~/server/db/schema";
import { generateSSHKey } from "~/server/utils/filesystem/ssh";
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
	generate: protectedProcedure
		.input(apiGenerateSSHKey)
		.mutation(async ({ input }) => {
			return await generateSSHKey(input);
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
