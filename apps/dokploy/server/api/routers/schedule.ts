import { IS_CLOUD, removeScheduleJob, scheduleJob } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { deployments } from "@dokploy/server/db/schema/deployment";
import {
	createScheduleSchema,
	schedules,
	updateScheduleSchema,
} from "@dokploy/server/db/schema/schedule";
import { runCommand } from "@dokploy/server/index";
import {
	createSchedule,
	deleteSchedule,
	findScheduleById,
	updateSchedule,
} from "@dokploy/server/services/schedule";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { removeJob, schedule } from "@/server/utils/backup";
import { createTRPCRouter, protectedProcedure } from "../trpc";
export const scheduleRouter = createTRPCRouter({
	create: protectedProcedure
		.input(createScheduleSchema)
		.mutation(async ({ input }) => {
			const newSchedule = await createSchedule(input);

			if (newSchedule?.enabled) {
				if (IS_CLOUD) {
					schedule({
						scheduleId: newSchedule.scheduleId,
						type: "schedule",
						cronSchedule: newSchedule.cronExpression,
					});
				} else {
					scheduleJob(newSchedule);
				}
			}
			return newSchedule;
		}),

	update: protectedProcedure
		.input(updateScheduleSchema)
		.mutation(async ({ input }) => {
			const updatedSchedule = await updateSchedule(input);

			if (IS_CLOUD) {
				if (updatedSchedule?.enabled) {
					schedule({
						scheduleId: updatedSchedule.scheduleId,
						type: "schedule",
						cronSchedule: updatedSchedule.cronExpression,
					});
				} else {
					await removeJob({
						cronSchedule: updatedSchedule.cronExpression,
						scheduleId: updatedSchedule.scheduleId,
						type: "schedule",
					});
				}
			} else {
				if (updatedSchedule?.enabled) {
					removeScheduleJob(updatedSchedule.scheduleId);
					scheduleJob(updatedSchedule);
				} else {
					removeScheduleJob(updatedSchedule.scheduleId);
				}
			}
			return updatedSchedule;
		}),

	delete: protectedProcedure
		.input(z.object({ scheduleId: z.string() }))
		.mutation(async ({ input }) => {
			const schedule = await findScheduleById(input.scheduleId);
			await deleteSchedule(input.scheduleId);

			if (IS_CLOUD) {
				await removeJob({
					cronSchedule: schedule.cronExpression,
					scheduleId: schedule.scheduleId,
					type: "schedule",
				});
			} else {
				removeScheduleJob(schedule.scheduleId);
			}
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
