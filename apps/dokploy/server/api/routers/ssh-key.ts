import {
	createSshKey,
	findSSHKeyById,
	generateSSHKey,
	removeSSHKeyById,
	updateSSHKeyById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createTRPCRouter, withPermission } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateSshKey,
	apiFindOneSshKey,
	apiGenerateSSHKey,
	apiRemoveSshKey,
	apiUpdateSshKey,
	sshKeys,
} from "@/server/db/schema";

export const sshRouter = createTRPCRouter({
	create: withPermission("sshKeys", "create")
		.input(apiCreateSshKey)
		.mutation(async ({ input, ctx }) => {
			try {
				await createSshKey({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "create",
					resourceType: "sshKey",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the SSH key",
					cause: error,
				});
			}
		}),
	remove: withPermission("sshKeys", "delete")
		.input(apiRemoveSshKey)
		.mutation(async ({ input, ctx }) => {
			try {
				const sshKey = await findSSHKeyById(input.sshKeyId);
				if (sshKey.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this SSH key",
					});
				}

				await audit(ctx, {
					action: "delete",
					resourceType: "sshKey",
					resourceId: sshKey.sshKeyId,
					resourceName: sshKey.name,
				});
				return await removeSSHKeyById(input.sshKeyId);
			} catch (error) {
				throw error;
			}
		}),
	one: withPermission("sshKeys", "read")
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
	all: withPermission("sshKeys", "read").query(async ({ ctx }) => {
		return await db.query.sshKeys.findMany({
			where: eq(sshKeys.organizationId, ctx.session.activeOrganizationId),
			orderBy: desc(sshKeys.createdAt),
		});
	}),
	generate: withPermission("sshKeys", "read")
		.input(apiGenerateSSHKey)
		.mutation(async ({ input }) => {
			return await generateSSHKey(input.type);
		}),
	update: withPermission("sshKeys", "create")
		.input(apiUpdateSshKey)
		.mutation(async ({ input, ctx }) => {
			try {
				const sshKey = await findSSHKeyById(input.sshKeyId);
				if (sshKey.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to update this SSH key",
					});
				}
				const result = await updateSSHKeyById(input);
				await audit(ctx, {
					action: "update",
					resourceType: "sshKey",
					resourceId: sshKey.sshKeyId,
					resourceName: sshKey.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating this SSH key",
					cause: error,
				});
			}
		}),
});
