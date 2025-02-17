import { apiFindOneUser, apiFindOneUserByAuth } from "@/server/db/schema";
import {
	IS_CLOUD,
	findUserByAuthId,
	findUserById,
	removeUserById,
	updateUser,
	verify2FA,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { account, apiUpdateUser, member } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
export const userRouter = createTRPCRouter({
	all: adminProcedure.query(async ({ ctx }) => {
		return await db.query.member.findMany({
			where: eq(member.organizationId, ctx.session.activeOrganizationId),
			with: {
				user: true,
			},
		});
	}),
	one: protectedProcedure
		.input(
			z.object({
				userId: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const user = await findUserById(input.userId);
			// if (user.adminId !== ctx.user.adminId) {
			// 	throw new TRPCError({
			// 		code: "UNAUTHORIZED",
			// 		message: "You are not allowed to access this user",
			// 	});
			// }
			return user;
		}),
	get: protectedProcedure.query(async ({ ctx }) => {
		return await findUserById(ctx.user.id);
	}),
	update: protectedProcedure
		.input(apiUpdateUser)
		.mutation(async ({ input, ctx }) => {
			return await updateUser(ctx.user.id, input);
		}),

	remove: protectedProcedure
		.input(
			z.object({
				userId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			return await removeUserById(input.userId);
		}),
});
