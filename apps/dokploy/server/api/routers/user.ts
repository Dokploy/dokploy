import { apiFindOneUser, apiFindOneUserByAuth } from "@/server/db/schema";
import { findUserByAuthId, findUserById, findUsers } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { member } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
import { z } from "zod";
export const userRouter = createTRPCRouter({
	all: adminProcedure.query(async ({ ctx }) => {
		return await db.query.member.findMany({
			where: eq(member.organizationId, ctx.session.activeOrganizationId),
			with: {
				user: true,
			},
		});
	}),
	get: protectedProcedure
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
	byUserId: protectedProcedure
		.input(apiFindOneUser)
		.query(async ({ input, ctx }) => {
			const user = await findUserById(input.userId);
			if (user.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this user",
				});
			}
			return user;
		}),
});
