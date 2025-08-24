import {
	createPort,
	finPortById,
	removePortById,
	updatePortById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiCreatePort,
	apiFindOnePort,
	apiUpdatePort,
} from "@/server/db/schema";

export const portRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreatePort)
		.mutation(async ({ input }) => {
			try {
				await createPort(input);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error input: Inserting port",
					cause: error,
				});
			}
		}),
	one: protectedProcedure.input(apiFindOnePort).query(async ({ input }) => {
		try {
			return await finPortById(input.portId);
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Port not found",
				cause: error,
			});
		}
	}),
	delete: protectedProcedure
		.input(apiFindOnePort)
		.mutation(async ({ input }) => {
			try {
				return removePortById(input.portId);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Error input: Deleting port";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
	update: protectedProcedure
		.input(apiUpdatePort)
		.mutation(async ({ input }) => {
			try {
				return updatePortById(input.portId, input);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Error updating the port";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
});
