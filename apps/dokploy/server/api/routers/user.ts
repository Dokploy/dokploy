import { apiFindOneUser, apiFindOneUserByAuth } from "@/server/db/schema";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

import { findUserByAuthId, findUserById, findUsers } from "@dokploy/builders";

export const userRouter = createTRPCRouter({
	all: adminProcedure.query(async () => {
		return await findUsers();
	}),
	byAuthId: protectedProcedure
		.input(apiFindOneUserByAuth)
		.query(async ({ input }) => {
			return await findUserByAuthId(input.authId);
		}),
	byUserId: protectedProcedure
		.input(apiFindOneUser)
		.query(async ({ input }) => {
			return await findUserById(input.userId);
		}),
});
