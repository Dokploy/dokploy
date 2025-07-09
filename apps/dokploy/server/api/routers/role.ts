import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiFindOneRole,
	createRoleSchema,
	role,
	updateRoleSchema,
} from "@/server/db/schema";
import { createRole, removeRoleById, updateRoleById } from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

export const roleRouter = createTRPCRouter({
	all: protectedProcedure.query(async ({ ctx }) => {
		const roles = await db.query.role.findMany({
			where: and(
				eq(role.organizationId, ctx.session.activeOrganizationId),
				eq(role.isSystem, false),
			),
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
		const result = await db.query.role.findMany({
			where: and(
				eq(role.organizationId, ctx.session.activeOrganizationId),
				eq(role.isSystem, true),
			),
		});

		return {
			owner: result.find((r) => r.name === "owner"),
			admin: result.find((r) => r.name === "admin"),
			member: result.find((r) => r.name === "member"),
		};
	}),
});
