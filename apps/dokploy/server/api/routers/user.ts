import { apiFindOneUser, apiFindOneUserByAuth } from "@/server/db/schema";
import {
	findUserByAuthId,
	findUserById,
	updateUser,
	verify2FA,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { apiUpdateUser, member } from "@dokploy/server/db/schema";
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
	verify2FASetup: protectedProcedure
		.input(
			z.object({
				secret: z.string(),
				pin: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const user = await findUserById(ctx.user.id);
			await verify2FA(user, input.secret, input.pin);
			await updateUser(user.id, {
				secret: input.secret,
			});
			return user;
		}),
});
