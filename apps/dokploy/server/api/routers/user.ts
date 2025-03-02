import { apiFindOneUser, apiFindOneUserByAuth } from "@/server/db/schema";
import { findUserByAuthId, findUserById, findUsers } from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
	all: adminProcedure.query(async ({ ctx }) => {
		return await findUsers(ctx.user.adminId);
	}),
	byAuthId: protectedProcedure
		.input(apiFindOneUserByAuth)
		.query(async ({ input, ctx }) => {
			const user = await findUserByAuthId(input.authId);
			if (user.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this user",
				});
			}
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
