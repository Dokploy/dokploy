import {
	createSshKey,
	findSSHKeyById,
	generateSSHKey,
	recordActivity,
	removeSSHKeyById,
	updateSSHKeyById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
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

export const sshRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateSshKey)
		.mutation(async ({ input, ctx }) => {
			try {
				const sshKey = await createSshKey({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await recordActivity({
					userId: ctx.user.id,
					organizationId: ctx.session.activeOrganizationId,
					action: "ssh_key.create",
					resourceType: "system",
					resourceId: sshKey?.sshKeyId,
					metadata: { name: sshKey?.name },
				});
				return sshKey;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the SSH key",
					cause: error,
				});
			}
		}),
	remove: protectedProcedure
		.input(apiRemoveSshKey)
		.mutation(async ({ input, ctx }) => {
			const sshKey = await findSSHKeyById(input.sshKeyId);
			if (sshKey.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this SSH key",
				});
			}

			try {
				const result = await removeSSHKeyById(input.sshKeyId);
				await recordActivity({
					userId: ctx.user.id,
					organizationId: ctx.session.activeOrganizationId,
					action: "ssh_key.delete",
					resourceType: "system",
					resourceId: sshKey.sshKeyId,
					metadata: { name: sshKey.name },
				});
				return result;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error deleting the SSH key",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneSshKey)
		.query(async ({ input, ctx }) => {
			const sshKey = await findSSHKeyById(input.sshKeyId);

			if (sshKey.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this SSH key",
				});
			}
			return sshKey;
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.sshKeys.findMany({
			where: eq(sshKeys.organizationId, ctx.session.activeOrganizationId),
			orderBy: desc(sshKeys.createdAt),
		});
	}),
	generate: protectedProcedure
		.input(apiGenerateSSHKey)
		.mutation(async ({ input }) => {
			return await generateSSHKey(input.type);
		}),
	update: protectedProcedure
		.input(apiUpdateSshKey)
		.mutation(async ({ input, ctx }) => {
			const sshKey = await findSSHKeyById(input.sshKeyId);
			if (sshKey.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to update this SSH key",
				});
			}
			try {
				const result = await updateSSHKeyById(input);
				await recordActivity({
					userId: ctx.user.id,
					organizationId: ctx.session.activeOrganizationId,
					action: "ssh_key.update",
					resourceType: "system",
					resourceId: sshKey.sshKeyId,
					metadata: { name: sshKey.name },
				});
				return result;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the SSH key",
					cause: error,
				});
			}
		}),
});
