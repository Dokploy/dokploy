import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createScheduleSchema,
	schedules,
	updateScheduleSchema,
} from "@dokploy/server/db/schema/schedule";
import { desc, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { runCommand } from "@dokploy/server/index";
import { deployments } from "@dokploy/server/db/schema/deployment";

export const scheduleRouter = createTRPCRouter({
	create: protectedProcedure
		.input(createScheduleSchema)
		.mutation(async ({ ctx, input }) => {
			const { scheduleId, ...rest } = input;
			const [schedule] = await ctx.db
				.insert(schedules)
				.values(rest)
				.returning();
			return schedule;
		}),

	update: protectedProcedure
		.input(updateScheduleSchema)
		.mutation(async ({ ctx, input }) => {
			const { scheduleId, ...rest } = input;
			const [schedule] = await ctx.db
				.update(schedules)
				.set(rest)
				.where(eq(schedules.scheduleId, scheduleId))
				.returning();

			if (!schedule) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Schedule not found",
				});
			}

			return schedule;
		}),

	delete: protectedProcedure
		.input(z.object({ scheduleId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [schedule] = await ctx.db
				.delete(schedules)
				.where(eq(schedules.scheduleId, input.scheduleId))
				.returning();

			if (!schedule) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Schedule not found",
				});
			}

			return schedule;
		}),

	list: protectedProcedure
		.input(z.object({ applicationId: z.string() }))
		.query(async ({ ctx, input }) => {
			return ctx.db.query.schedules.findMany({
				where: eq(schedules.applicationId, input.applicationId),
				with: {
					application: true,
					deployments: {
						orderBy: [desc(deployments.createdAt)],
					},
				},
			});
		}),

	one: protectedProcedure
		.input(z.object({ scheduleId: z.string() }))
		.query(async ({ ctx, input }) => {
			const [schedule] = await ctx.db
				.select()
				.from(schedules)
				.where(eq(schedules.scheduleId, input.scheduleId));

			if (!schedule) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Schedule not found",
				});
			}

			return schedule;
		}),

	runManually: protectedProcedure
		.input(z.object({ scheduleId: z.string().min(1) }))
		.mutation(async ({ input }) => {
			try {
				await runCommand(input.scheduleId);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Error running schedule",
				});
			}
		}),
});
