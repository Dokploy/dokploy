import path from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { paths } from "../constants";
import { db } from "../db";
import type {
	createScheduleSchema,
	updateScheduleSchema,
} from "../db/schema/schedule";
import { type Schedule, schedules } from "../db/schema/schedule";
import { APP_NAME_REGEX } from "../db/schema/utils";
import { encodeBase64 } from "../utils/docker/utils";
import { quoteShellArg } from "../utils/filesystem/safe-path";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";

export type ScheduleExtended = Awaited<ReturnType<typeof findScheduleById>>;

export const normalizeScheduleAppName = (appName?: string | null) => {
	const safeAppName = appName?.trim() || "";
	if (
		!APP_NAME_REGEX.test(safeAppName) ||
		safeAppName === "." ||
		safeAppName === ".."
	) {
		throw new Error("Invalid schedule app name");
	}

	return safeAppName;
};

const resolveSchedulePathInsideBase = (
	basePath: string,
	...segments: string[]
) => {
	const absoluteBasePath = path.resolve(basePath);
	const fullPath = path.resolve(absoluteBasePath, ...segments);
	const relativePath = path.relative(absoluteBasePath, fullPath);
	if (
		relativePath === "" ||
		relativePath === ".." ||
		relativePath.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativePath)
	) {
		throw new Error("Invalid schedule app name");
	}
	return fullPath;
};

export const getScheduleDirectory = (
	basePath: string,
	appName?: string | null,
) => resolveSchedulePathInsideBase(basePath, normalizeScheduleAppName(appName));

export const getScheduleScriptPath = (
	basePath: string,
	appName?: string | null,
) =>
	resolveSchedulePathInsideBase(
		basePath,
		normalizeScheduleAppName(appName),
		"script.sh",
	);

export const getScheduleDeploymentLogPath = (
	basePath: string,
	appName: string,
	formattedDateTime: string,
) => {
	const safeAppName = normalizeScheduleAppName(appName);
	return resolveSchedulePathInsideBase(
		basePath,
		safeAppName,
		`${safeAppName}-${formattedDateTime}.log`,
	);
};

export const buildDeleteScheduleCommand = (
	basePath: string,
	appName?: string | null,
) => `rm -rf -- ${quoteShellArg(getScheduleDirectory(basePath, appName))}`;

export const buildScheduleScriptCommand = (
	basePath: string,
	schedule: Pick<Schedule, "appName" | "scheduleId" | "script">,
) => {
	const fullPath = getScheduleDirectory(basePath, schedule.appName);
	const scriptPath = getScheduleScriptPath(basePath, schedule.appName);
	const scriptWithPid = `echo "PID: $$ | Schedule ID: ${schedule.scheduleId}"
${schedule.script || ""}`;
	const encodedContent = encodeBase64(scriptWithPid);

	return `
		mkdir -p ${quoteShellArg(fullPath)}
		rm -f ${quoteShellArg(scriptPath)}
		touch ${quoteShellArg(scriptPath)}
		chmod +x ${quoteShellArg(scriptPath)}
		printf %s ${quoteShellArg(encodedContent)} | base64 -d > ${quoteShellArg(scriptPath)}
	`;
};

export const createSchedule = async (
	input: z.infer<typeof createScheduleSchema>,
) => {
	const { scheduleId, ...rest } = input;
	const [newSchedule] = await db
		.insert(schedules)
		.values(rest as typeof schedules.$inferInsert)
		.returning();

	if (
		newSchedule &&
		(newSchedule.scheduleType === "dokploy-server" ||
			newSchedule.scheduleType === "server")
	) {
		await handleScript(newSchedule);
	}

	return newSchedule;
};

export const findScheduleById = async (scheduleId: string) => {
	const schedule = await db.query.schedules.findFirst({
		where: eq(schedules.scheduleId, scheduleId),
		with: {
			application: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			compose: {
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			},
			server: {
				with: {
					organization: true,
				},
			},
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

export const findScheduleOrganizationId = async (scheduleId: string) => {
	const schedule = await findScheduleById(scheduleId);

	if (schedule?.application) {
		return schedule?.application?.environment?.project?.organizationId;
	}
	if (schedule?.compose) {
		return schedule?.compose?.environment?.project?.organizationId;
	}
	if (schedule?.server) {
		return schedule?.server?.organization?.id;
	}
	if (schedule?.organizationId) {
		return schedule.organizationId;
	}
	return null;
};

export const deleteSchedule = async (scheduleId: string) => {
	const schedule = await findScheduleById(scheduleId);
	const serverId =
		schedule?.serverId ||
		schedule?.application?.serverId ||
		schedule?.compose?.serverId;
	const { SCHEDULES_PATH } = paths(!!serverId);

	const command = buildDeleteScheduleCommand(SCHEDULES_PATH, schedule?.appName);
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
		.set(rest as Partial<typeof schedules.$inferInsert>)
		.where(eq(schedules.scheduleId, scheduleId))
		.returning();

	if (!updatedSchedule) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Schedule not found",
		});
	}

	if (
		updatedSchedule?.scheduleType === "dokploy-server" ||
		updatedSchedule?.scheduleType === "server"
	) {
		await handleScript(updatedSchedule);
	}

	return updatedSchedule;
};

const handleScript = async (schedule: Schedule) => {
	const { SCHEDULES_PATH } = paths(!!schedule?.serverId);
	const script = buildScheduleScriptCommand(SCHEDULES_PATH, schedule);

	if (schedule?.scheduleType === "dokploy-server") {
		await execAsync(script);
	} else if (schedule?.scheduleType === "server") {
		await execAsyncRemote(schedule?.serverId || "", script);
	}
};
