import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createScheduleSchema,
	schedules,
} from "@dokploy/server/db/schema/schedule";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const scheduleRouter = createTRPCRouter({
	create: protectedProcedure
		.input(createScheduleSchema)
		.mutation(async ({ ctx, input }) => {
			const [schedule] = await ctx.db
				.insert(schedules)
				.values(input)
				.returning();
			return schedule;
		}),

	update: protectedProcedure
		.input(createScheduleSchema.extend({ scheduleId: z.string() }))
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
			return ctx.db
				.select()
				.from(schedules)
				.where(eq(schedules.applicationId, input.applicationId));
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
		.input(z.object({ scheduleId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const schedule = await ctx.db
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
});
