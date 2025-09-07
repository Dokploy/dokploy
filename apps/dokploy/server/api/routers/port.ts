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
	one: protectedProcedure
		.input(apiFindOnePort)
		.query(async ({ input, ctx }) => {
			try {
				const port = await finPortById(input.portId);
				if (
					port.application.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this port",
					});
				}
				return port;
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
		.mutation(async ({ input, ctx }) => {
			const port = await finPortById(input.portId);
			if (
				port.application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this port",
				});
			}
			try {
				return await removePortById(input.portId);
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
		.mutation(async ({ input, ctx }) => {
			const port = await finPortById(input.portId);
			if (
				port.application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this port",
				});
			}
			try {
				return await updatePortById(input.portId, input);
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
