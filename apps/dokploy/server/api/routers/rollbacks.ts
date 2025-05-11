import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { apiFindOneRollback, rollbacks } from "@/server/db/schema";
import { removeRollbackById, rollback } from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/server/db";
import { z } from "zod";

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
	all: protectedProcedure
		.input(
			z.object({
				applicationId: z.string(),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await db.query.rollbacks.findMany({
					where: eq(rollbacks.applicationId, input.applicationId),
					orderBy: desc(rollbacks.createdAt),
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Fetching rollbacks",
					cause: error,
				});
			}
		}),
	rollback: protectedProcedure
		.input(apiFindOneRollback)
		.mutation(async ({ input }) => {
			try {
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
