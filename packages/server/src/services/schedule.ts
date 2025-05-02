import { schedules } from "../db/schema/schedule";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const findScheduleById = async (scheduleId: string) => {
	const schedule = await db.query.schedules.findFirst({
		where: eq(schedules.scheduleId, scheduleId),
		with: {
			application: true,
		},
	});

	if (!schedule) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Schedule not found",
		});
	}
	return schedule;
};
