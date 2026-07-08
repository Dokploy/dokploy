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
	checkPermission,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import {
	createSchedule,
	deleteSchedule,
	findScheduleById,
	updateSchedule,
} from "@dokploy/server/services/schedule";
import { signScheduledQueueJob } from "@dokploy/server/utils/schedules/signed-job";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { assertTargetServerAccess } from "@/server/api/utils/placement-access";
import { assertScheduledJobLimit } from "@/server/api/utils/plan-limits";
import {
	removeJob,
	removeSignedJob,
	schedule,
	updateJob,
} from "@/server/utils/backup";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const scheduleBindingError = () =>
	new TRPCError({
		code: "FORBIDDEN",
		message: "Changing schedule service or server binding is not allowed.",
	});

const resolveCreateScheduleType = (input: {
	applicationId?: string | null;
	composeId?: string | null;
	scheduleType?: "application" | "compose" | "server" | "dokploy-server";
}) => {
	if (input.applicationId && input.composeId) {
		throw scheduleBindingError();
	}

	if (input.applicationId) {
		if (input.scheduleType && input.scheduleType !== "application") {
			throw scheduleBindingError();
		}
		return "application" as const;
	}

	if (input.composeId) {
		if (input.scheduleType && input.scheduleType !== "compose") {
			throw scheduleBindingError();
		}
		return "compose" as const;
	}

	if (!input.scheduleType || input.scheduleType === "application") {
		throw scheduleBindingError();
	}

	if (input.scheduleType === "compose") {
		throw scheduleBindingError();
	}

	return input.scheduleType;
};

type CreateScheduleTypeInput = Parameters<typeof resolveCreateScheduleType>[0];

const assertScheduleBindingUnchanged = (
	existingSchedule: Awaited<ReturnType<typeof findScheduleById>>,
	input: z.infer<typeof updateScheduleSchema>,
) => {
	const fields = [
		"scheduleType",
		"applicationId",
		"composeId",
		"serverId",
		"organizationId",
	] as const;

	for (const field of fields) {
		const inputValue = input[field];
		if (
			inputValue !== undefined &&
			inputValue !== (existingSchedule[field] ?? null)
		) {
			throw scheduleBindingError();
		}
	}
};

const assertServerLevelScheduleAccess = async (
	ctx: {
		user: { id: string; role: string };
		session: { userId: string; activeOrganizationId: string };
	},
	scheduleItem: Awaited<ReturnType<typeof findScheduleById>>,
) => {
	if (
		scheduleItem.scheduleType !== "server" &&
		scheduleItem.scheduleType !== "dokploy-server"
	) {
		return;
	}

	if (scheduleItem.scheduleType === "dokploy-server") {
		if (IS_CLOUD) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Host-level schedules are not available in the cloud version.",
			});
		}

		if (scheduleItem.organizationId !== ctx.session.activeOrganizationId) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You are not allowed to access this host-level schedule.",
			});
		}
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

	if (scheduleItem.scheduleType === "server" && scheduleItem.serverId) {
		await assertTargetServerAccess(ctx, scheduleItem.serverId);
	}
};

export const scheduleRouter = createTRPCRouter({
	create: protectedProcedure
		.input(createScheduleSchema)
		.mutation(async ({ input, ctx }) => {
			const scheduleType = resolveCreateScheduleType({
				applicationId: input.applicationId,
				composeId: input.composeId,
				scheduleType:
					input.scheduleType as CreateScheduleTypeInput["scheduleType"],
			});
			const serviceId = input.applicationId || input.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					schedule: ["create"],
				});
				if (IS_CLOUD) {
					await assertScheduledJobLimit(
						ctx.session.activeOrganizationId,
						input.applicationId ? "application" : "compose",
						serviceId,
					);
				}
			} else {
				if (input.scheduleType === "dokploy-server" && IS_CLOUD) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message:
							"Host-level schedules are not available in the cloud version.",
					});
				}

				await checkPermission(ctx, { schedule: ["create"] });

				if (
					input.scheduleType === "server" ||
					input.scheduleType === "dokploy-server"
				) {
					const member = await findMemberByUserId(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);
					if (member.role !== "owner" && member.role !== "admin") {
						throw new TRPCError({
							code: "FORBIDDEN",
							message:
								"Only owners and admins can manage server-level schedules.",
						});
					}
				}

				if (input.scheduleType === "server" && input.serverId) {
					await assertTargetServerAccess(ctx, input.serverId);
					if (IS_CLOUD) {
						await assertScheduledJobLimit(
							ctx.session.activeOrganizationId,
							"server",
							input.serverId,
						);
					}
				}
			}
			const newSchedule = await createSchedule({
				...input,
				scheduleType,
				...(scheduleType === "dokploy-server" && {
					organizationId: ctx.session.activeOrganizationId,
				}),
			});

			if (newSchedule?.enabled) {
				if (IS_CLOUD) {
					schedule({
						scheduleId: newSchedule.scheduleId,
						type: "schedule",
						cronSchedule: newSchedule.cronExpression,
						timezone: newSchedule.timezone,
					});
				} else {
					scheduleJob(newSchedule);
				}
			}
			await audit(ctx, {
				action: "create",
				resourceType: "schedule",
				resourceId: newSchedule?.scheduleId,
				resourceName: newSchedule?.name,
			});
			return newSchedule;
		}),

	update: protectedProcedure
		.input(updateScheduleSchema)
		.mutation(async ({ input, ctx }) => {
			const existingSchedule = await findScheduleById(input.scheduleId);
			assertScheduleBindingUnchanged(existingSchedule, input);

			if (
				IS_CLOUD &&
				input.scheduleType &&
				input.scheduleType !== existingSchedule.scheduleType
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Changing scheduleType is not allowed in the cloud version.",
				});
			}

			const serviceId =
				existingSchedule.applicationId || existingSchedule.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					schedule: ["update"],
				});
			} else {
				await checkPermission(ctx, { schedule: ["update"] });
				await assertServerLevelScheduleAccess(ctx, existingSchedule);
			}
			const signedRemovalJob =
				IS_CLOUD && existingSchedule.enabled
					? await signScheduledQueueJob(
							{
								scheduleId: existingSchedule.scheduleId,
								type: "schedule",
								cronSchedule: existingSchedule.cronExpression,
								timezone: existingSchedule.timezone ?? undefined,
							},
							{
								operation: "remove",
								requireEnabled: false,
								requireActiveServer: false,
							},
						)
					: null;
			const updatedSchedule = await updateSchedule(input);

			if (IS_CLOUD) {
				if (updatedSchedule?.enabled) {
					await updateJob({
						scheduleId: updatedSchedule.scheduleId,
						type: "schedule",
						cronSchedule: updatedSchedule.cronExpression,
						timezone: updatedSchedule.timezone,
					});
				} else if (signedRemovalJob) {
					await removeSignedJob(signedRemovalJob);
				}
			} else {
				if (updatedSchedule?.enabled) {
					removeScheduleJob(updatedSchedule.scheduleId);
					scheduleJob(updatedSchedule);
				} else {
					removeScheduleJob(updatedSchedule.scheduleId);
				}
			}
			await audit(ctx, {
				action: "update",
				resourceType: "schedule",
				resourceId: updatedSchedule.scheduleId,
				resourceName: updatedSchedule.name,
			});
			return updatedSchedule;
		}),

	delete: protectedProcedure
		.input(z.object({ scheduleId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const scheduleItem = await findScheduleById(input.scheduleId);
			const serviceId = scheduleItem.applicationId || scheduleItem.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					schedule: ["delete"],
				});
			} else {
				await checkPermission(ctx, { schedule: ["delete"] });
				await assertServerLevelScheduleAccess(ctx, scheduleItem);
			}
			if (IS_CLOUD) {
				await removeJob({
					cronSchedule: scheduleItem.cronExpression,
					scheduleId: scheduleItem.scheduleId,
					type: "schedule",
					timezone: scheduleItem.timezone,
				});
			} else {
				removeScheduleJob(scheduleItem.scheduleId);
			}
			await deleteSchedule(input.scheduleId);
			await audit(ctx, {
				action: "delete",
				resourceType: "schedule",
				resourceId: scheduleItem.scheduleId,
				resourceName: scheduleItem.name,
			});
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
		.query(async ({ input, ctx }) => {
			if (
				input.scheduleType === "application" ||
				input.scheduleType === "compose"
			) {
				await checkServicePermissionAndAccess(ctx, input.id, {
					schedule: ["read"],
				});
			} else {
				await checkPermission(ctx, { schedule: ["read"] });

				if (input.scheduleType === "server") {
					await assertTargetServerAccess(ctx, input.id);
				}

				if (input.scheduleType === "dokploy-server") {
					const member = await findMemberByUserId(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);
					if (member.role !== "owner" && member.role !== "admin") {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "Only owners and admins can list host-level schedules.",
						});
					}
				}
			}
			const where = {
				application: eq(schedules.applicationId, input.id),
				compose: eq(schedules.composeId, input.id),
				server: eq(schedules.serverId, input.id),
				"dokploy-server": eq(
					schedules.organizationId,
					ctx.session.activeOrganizationId,
				),
			};
			return db.query.schedules.findMany({
				where: where[input.scheduleType],
				orderBy: [asc(schedules.createdAt)],
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
		.query(async ({ input, ctx }) => {
			const schedule = await findScheduleById(input.scheduleId);
			const serviceId = schedule.applicationId || schedule.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					schedule: ["read"],
				});
			} else {
				await checkPermission(ctx, { schedule: ["read"] });
				await assertServerLevelScheduleAccess(ctx, schedule);
			}
			return schedule;
		}),

	runManually: protectedProcedure
		.input(z.object({ scheduleId: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			const scheduleItem = await findScheduleById(input.scheduleId);
			const serviceId = scheduleItem.applicationId || scheduleItem.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					schedule: ["create"],
				});
			} else {
				await checkPermission(ctx, { schedule: ["create"] });
				await assertServerLevelScheduleAccess(ctx, scheduleItem);
			}
			try {
				await runCommand(input.scheduleId);
				await audit(ctx, {
					action: "run",
					resourceType: "schedule",
					resourceId: input.scheduleId,
				});
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
