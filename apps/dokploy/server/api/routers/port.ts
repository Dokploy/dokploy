import {
	createPort,
	finPortById,
	removePortById,
	updatePortById,
} from "@dokploy/server";
import {
	apiCreatePortOutput,
	apiDeletePortOutput,
	apiFindOnePortOutput,
	apiUpdatePortOutput,
} from "@dokploy/server/api";
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
		.output(apiCreatePortOutput)
		.mutation(async ({ input }) => {
			try {
				return await createPort(input);
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
		.output(apiFindOnePortOutput)
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
		.output(apiDeletePortOutput)
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
		.output(apiUpdatePortOutput)
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
