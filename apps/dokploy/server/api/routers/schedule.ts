import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createScheduleSchema,
	schedules,
	updateScheduleSchema,
} from "@dokploy/server/db/schema/schedule";
import { desc, eq } from "drizzle-orm";
import { db } from "@dokploy/server/db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { runCommand } from "@dokploy/server/index";
import { deployments } from "@dokploy/server/db/schema/deployment";
import {
	deleteSchedule,
	findScheduleById,
	createSchedule,
	updateSchedule,
} from "@dokploy/server/services/schedule";

export const scheduleRouter = createTRPCRouter({
	create: protectedProcedure
		.input(createScheduleSchema)
		.mutation(async ({ input }) => {
			const schedule = await createSchedule(input);
			return schedule;
		}),

	update: protectedProcedure
		.input(updateScheduleSchema)
		.mutation(async ({ input }) => {
			const schedule = await updateSchedule(input);
			return schedule;
		}),

	delete: protectedProcedure
		.input(z.object({ scheduleId: z.string() }))
		.mutation(async ({ input }) => {
			await deleteSchedule(input.scheduleId);

			return true;
		}),

	list: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				scheduleType: z.enum([
					"application",
					"compose",
					"server",
					"dokploy-server",
				]),
			}),
		)
		.query(async ({ input }) => {
			const where = {
				application: eq(schedules.applicationId, input.id),
				compose: eq(schedules.composeId, input.id),
				server: eq(schedules.serverId, input.id),
				"dokploy-server": eq(schedules.userId, input.id),
			};
			return db.query.schedules.findMany({
				where: where[input.scheduleType],
				with: {
					application: true,
					server: true,
					compose: true,
					deployments: {
						orderBy: [desc(deployments.createdAt)],
					},
				},
			});
		}),

	one: protectedProcedure
		.input(z.object({ scheduleId: z.string() }))
		.query(async ({ input }) => {
			return await findScheduleById(input.scheduleId);
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
