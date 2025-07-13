import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiFindOneRole,
	createRoleSchema,
	role,
	updateRoleSchema,
} from "@/server/db/schema";
import { createRole, removeRoleById, updateRoleById } from "@dokploy/server";
import { defaultPermissions } from "@dokploy/server/lib/permissions";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";

export const roleRouter = createTRPCRouter({
	all: protectedProcedure.query(async ({ ctx }) => {
		const roles = await db.query.role.findMany({
			where: and(
				eq(role.organizationId, ctx.session.activeOrganizationId),
				eq(role.isSystem, false),
			),
			orderBy: [asc(role.createdAt)],
		});
		return roles;
	}),
	delete: protectedProcedure
		.input(apiFindOneRole)
		.mutation(async ({ input }) => {
			try {
				return removeRoleById(input.roleId);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Error input: Deleting role";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
	create: protectedProcedure
		.input(createRoleSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createRole(
					{
						...input,
					},
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				console.error(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Creating role",
					cause: error,
				});
			}
		}),
	update: protectedProcedure
		.input(updateRoleSchema)
		.mutation(async ({ input }) => {
			return await updateRoleById(input.roleId, input);
		}),
	getDefaultRoles: protectedProcedure.query(async ({ ctx }) => {
		const roles = await db.query.role.findMany({
			where: and(
				eq(role.organizationId, ctx.session.activeOrganizationId),
				eq(role.isSystem, true),
			),
		});
		// add the description from the constants roles to the roles
		const rolesWithDescription = defaultPermissions.map((role) => {
			const roleInfo = roles.find((r) => r.name === role.name);
			return {
				...roleInfo,
				...role,
			};
		});

		const set = new Set(rolesWithDescription.flatMap((r) => r.permissions));

		return {
			roles: rolesWithDescription,
			permissions: Array.from(set),
		};
	}),
});
