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
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
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
		.meta({
			openapi: {
				summary: "Create SSH key",
				description: "Stores a new SSH key for the current organization and logs an audit event.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Delete SSH key",
				description: "Removes an SSH key by ID. Verifies organization ownership and logs an audit event before deletion.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Get SSH key",
				description: "Returns a single SSH key by ID. Verifies the caller belongs to the same organization.",
			},
		})
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
	all: withPermission("sshKeys", "read")
		.meta({
			openapi: {
				summary: "List all SSH keys",
				description: "Returns all SSH keys for the current organization, ordered by creation date descending.",
			},
		})
		.query(async ({ ctx }) => {
		return await db.query.sshKeys.findMany({
			where: eq(sshKeys.organizationId, ctx.session.activeOrganizationId),
			orderBy: desc(sshKeys.createdAt),
		});
	}),
	allForApps: protectedProcedure
		.meta({
			openapi: {
				summary: "List SSH keys for app selection",
				description: "Returns a lightweight list of SSH keys (ID and name only) for the current organization, suitable for dropdown selectors in application forms.",
			},
		})
		.query(async ({ ctx }) => {
		return await db.query.sshKeys.findMany({
			columns: {
				sshKeyId: true,
				name: true,
			},
			where: eq(sshKeys.organizationId, ctx.session.activeOrganizationId),
			orderBy: desc(sshKeys.createdAt),
		});
	}),
	generate: withPermission("sshKeys", "read")
		.meta({
			openapi: {
				summary: "Generate SSH key pair",
				description: "Generates a new SSH key pair of the specified type (RSA, ED25519, etc.) and returns both public and private keys.",
			},
		})
		.input(apiGenerateSSHKey)
		.mutation(async ({ input }) => {
			return await generateSSHKey(input.type);
		}),
	update: withPermission("sshKeys", "create")
		.meta({
			openapi: {
				summary: "Update SSH key",
				description: "Updates an existing SSH key. Verifies organization ownership before applying changes and logs an audit event.",
			},
		})
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
