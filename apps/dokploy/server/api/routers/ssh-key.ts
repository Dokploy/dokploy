import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateSshKey,
	apiFindOneSshKey,
	apiGenerateSSHKey,
	apiRemoveSshKey,
	apiUpdateSshKey,
	sshKeys,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	generateSSHKey,
	createSshKey,
	findSSHKeyById,
	removeSSHKeyById,
	updateSSHKeyById,
} from "@dokploy/builders";
import { eq } from "drizzle-orm";

export const sshRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateSshKey)
		.mutation(async ({ input, ctx }) => {
			try {
				await createSshKey({
					...input,
					adminId: ctx.user.adminId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the ssh key",
					cause: error,
				});
			}
		}),
	remove: protectedProcedure
		.input(apiRemoveSshKey)
		.mutation(async ({ input }) => {
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
	all: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.sshKeys.findMany({
			where: eq(sshKeys.adminId, ctx.user.adminId),
		});
	}),
	generate: protectedProcedure
		.input(apiGenerateSSHKey)
		.mutation(async ({ input }) => {
			return await generateSSHKey(input.type);
		}),
	update: protectedProcedure
		.input(apiUpdateSshKey)
		.mutation(async ({ input }) => {
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
