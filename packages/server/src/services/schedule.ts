import { type Schedule, schedules } from "../db/schema/schedule";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import type {
	createScheduleSchema,
	updateScheduleSchema,
} from "../db/schema/schedule";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { IS_CLOUD, paths } from "../constants";
import path from "node:path";
import { encodeBase64 } from "../utils/docker/utils";
import { scheduleJob, removeScheduleJob } from "../utils/schedules/utils";

export type ScheduleExtended = Awaited<ReturnType<typeof findScheduleById>>;

export const createSchedule = async (
	input: z.infer<typeof createScheduleSchema>,
) => {
	const { scheduleId, ...rest } = input;
	const [newSchedule] = await db.insert(schedules).values(rest).returning();

	if (
		newSchedule &&
		(newSchedule.scheduleType === "dokploy-server" ||
			newSchedule.scheduleType === "server")
	) {
		await handleScript(newSchedule);
	}

	if (newSchedule?.enabled) {
		scheduleJob(newSchedule);
	}

	return newSchedule;
};

export const findScheduleById = async (scheduleId: string) => {
	const schedule = await db.query.schedules.findFirst({
		where: eq(schedules.scheduleId, scheduleId),
		with: {
			application: true,
			compose: true,
			server: true,
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

export const deleteSchedule = async (scheduleId: string) => {
	const schedule = await findScheduleById(scheduleId);
	const serverId =
		schedule?.serverId ||
		schedule?.application?.serverId ||
		schedule?.compose?.serverId;
	const { SCHEDULES_PATH } = paths(!!serverId);

	const fullPath = path.join(SCHEDULES_PATH, schedule?.appName || "");
	const command = `rm -rf ${fullPath}`;
	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}

	const scheduleResult = await db
		.delete(schedules)
		.where(eq(schedules.scheduleId, scheduleId));
	if (!scheduleResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Schedule not found",
		});
	}

	return true;
};

export const updateSchedule = async (
	input: z.infer<typeof updateScheduleSchema>,
) => {
	const { scheduleId, ...rest } = input;
	const [updatedSchedule] = await db
		.update(schedules)
		.set(rest)
		.where(eq(schedules.scheduleId, scheduleId))
		.returning();

	if (
		updatedSchedule?.scheduleType === "dokploy-server" ||
		updatedSchedule?.scheduleType === "server"
	) {
		await handleScript(updatedSchedule);
	}

	console.log("updatedSchedule", updatedSchedule);

	if (IS_CLOUD) {
		// scheduleJob(updatedSchedule);
	} else {
		if (updatedSchedule?.enabled) {
			removeScheduleJob(scheduleId);
			scheduleJob(updatedSchedule);
		} else {
			removeScheduleJob(scheduleId);
		}
	}
	return updatedSchedule;
};

const handleScript = async (schedule: Schedule) => {
	const { SCHEDULES_PATH } = paths(!!schedule?.serverId);
	const fullPath = path.join(SCHEDULES_PATH, schedule?.appName || "");
	const encodedContent = encodeBase64(schedule?.script || "");
	const script = `
	 	 mkdir -p ${fullPath}
	 	 rm -f ${fullPath}/script.sh
		 touch ${fullPath}/script.sh
		 chmod +x ${fullPath}/script.sh
		 echo "${encodedContent}" | base64 -d > ${fullPath}/script.sh
	`;

	if (schedule?.scheduleType === "dokploy-server") {
		await execAsync(script);
	} else if (schedule?.scheduleType === "server") {
		await execAsyncRemote(schedule?.serverId || "", script);
	}
};
