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
	findAdmin,
	getUserByToken,
	removeUserByAuthId,
} from "../services/admin";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";

export const adminRouter = createTRPCRouter({
	one: adminProcedure.query(async () => {
		const { sshPrivateKey, ...rest } = await findAdmin();
		return {
			haveSSH: !!sshPrivateKey,
			...rest,
		};
	}),
	createUserInvitation: adminProcedure
		.input(apiCreateUserInvitation)
		.mutation(async ({ input }) => {
			try {
				await createInvitation(input);
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
		.mutation(async ({ input }) => {
			try {
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
		.mutation(async ({ input }) => {
			try {
				await db
					.update(users)
					.set({
						...input,
					})
					.where(eq(users.userId, input.userId));
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to assign permissions",
				});
			}
		}),
});
