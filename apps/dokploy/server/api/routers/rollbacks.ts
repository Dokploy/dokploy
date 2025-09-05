import {
	findRollbackById,
	removeRollbackById,
	rollback,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { apiFindOneRollback } from "@/server/db/schema";

export const rollbackRouter = createTRPCRouter({
	delete: protectedProcedure
		.input(apiFindOneRollback)
		.mutation(async ({ input }) => {
			try {
				return removeRollbackById(input.rollbackId);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Error input: Deleting rollback";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
	rollback: protectedProcedure
		.input(apiFindOneRollback)
		.mutation(async ({ input, ctx }) => {
			try {
				const currentRollback = await findRollbackById(input.rollbackId);
				if (
					currentRollback?.deployment?.application?.environment?.project
						.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to rollback this deployment",
					});
				}
				return await rollback(input.rollbackId);
			} catch (error) {
				console.error(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Rolling back",
					cause: error,
				});
			}
		}),
});
