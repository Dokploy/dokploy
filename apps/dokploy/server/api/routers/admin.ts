import { db } from "@/server/db";
import {
	apiAssignPermissions,
	apiCreateUserInvitation,
	apiFindOneToken,
	apiRemoveUser,
	users,
} from "@/server/db/schema";

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
	createInvitation,
	getUserByToken,
	removeUserByAuthId,
	findAdminById,
	findUserByAuthId,
	findUserById,
} from "@dokploy/builders";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";

export const adminRouter = createTRPCRouter({
	one: adminProcedure.query(async ({ ctx }) => {
		const { sshPrivateKey, ...rest } = await findAdminById(ctx.user.adminId);
		return {
			haveSSH: !!sshPrivateKey,
			...rest,
		};
	}),
	createUserInvitation: adminProcedure
		.input(apiCreateUserInvitation)
		.mutation(async ({ input, ctx }) => {
			try {
				await createInvitation(input, ctx.user.adminId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Error to create this user\ncheck if the email is not registered",
					cause: error,
				});
			}
		}),
	removeUser: adminProcedure
		.input(apiRemoveUser)
		.mutation(async ({ input, ctx }) => {
			try {
				const user = await findUserByAuthId(input.authId);

				if (user.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this user",
					});
				}
				return await removeUserByAuthId(input.authId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this user",
					cause: error,
				});
			}
		}),
	getUserByToken: publicProcedure
		.input(apiFindOneToken)
		.query(async ({ input }) => {
			return await getUserByToken(input.token);
		}),
	assignPermissions: adminProcedure
		.input(apiAssignPermissions)
		.mutation(async ({ input, ctx }) => {
			try {
				const user = await findUserById(input.userId);

				if (user.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to assign permissions",
					});
				}
				await db
					.update(users)
					.set({
						...input,
					})
					.where(eq(users.userId, input.userId));
			} catch (error) {
				throw error;
			}
		}),
});
