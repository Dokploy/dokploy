import path from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import { IS_CLOUD, paths } from "../constants";
import { db } from "../db";
import type {
	createScheduleSchema,
	updateScheduleSchema,
} from "../db/schema/schedule";
import { type Schedule, schedules } from "../db/schema/schedule";
import { encodeBase64 } from "../utils/docker/utils";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { findMemberByUserId } from "./permission";
import { findServerById } from "./server";

export type ScheduleExtended = Awaited<ReturnType<typeof findScheduleById>>;

// Host-level schedules (server / dokploy-server) run their script as root on the
// host and must stay restricted to owners/admins, regardless of whether the
// request is also tied to a service. Attaching an accessible applicationId must
// not downgrade this to a service-access check.
export const assertHostScheduleAccess = async (
	ctx: { user: { id: string }; session: { activeOrganizationId: string } },
	scheduleType: Schedule["scheduleType"] | null | undefined,
	serverId: string | null | undefined,
) => {
	if (scheduleType !== "server" && scheduleType !== "dokploy-server") return;

	if (scheduleType === "dokploy-server" && IS_CLOUD) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Host-level schedules are not available in the cloud version.",
		});
	}

	const member = await findMemberByUserId(
		ctx.user.id,
		ctx.session.activeOrganizationId,
	);
	if (member.role !== "owner" && member.role !== "admin") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only owners and admins can manage server-level schedules.",
		});
	}

	if (scheduleType === "server" && serverId) {
		const targetServer = await findServerById(serverId);
		if (targetServer.organizationId !== ctx.session.activeOrganizationId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this server.",
			});
		}
	}
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

	const fullPath = path.join(SCHEDULES_PATH, schedule?.appName || "");
	const command = `rm -rf ${quote([fullPath])}`;
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
	const fullPath = path.join(SCHEDULES_PATH, schedule?.appName || "");

	// Add PID and Schedule ID echo by default to all scripts
	const scriptWithPid = `echo "PID: $$ | Schedule ID: ${schedule.scheduleId}"
${schedule?.script || ""}`;

	const encodedContent = encodeBase64(scriptWithPid);
	const scriptPath = `${fullPath}/script.sh`;
	const script = `
	 	 mkdir -p ${quote([fullPath])}
	 	 rm -f ${quote([scriptPath])}
		 touch ${quote([scriptPath])}
		 chmod +x ${quote([scriptPath])}
		 echo "${encodedContent}" | base64 -d > ${quote([scriptPath])}
	`;

	if (schedule?.scheduleType === "dokploy-server") {
		await execAsync(script);
	} else if (schedule?.scheduleType === "server") {
		await execAsyncRemote(schedule?.serverId || "", script);
	}
};
