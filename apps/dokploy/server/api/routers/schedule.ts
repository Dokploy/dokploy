import { IS_CLOUD, removeScheduleJob, scheduleJob } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { deployments } from "@dokploy/server/db/schema/deployment";
import {
	createScheduleSchema,
	type Schedule,
	schedules,
	updateScheduleSchema,
} from "@dokploy/server/db/schema/schedule";
import { runCommand } from "@dokploy/server/index";
import {
	checkPermission,
	checkServicePermissionAndAccess,
	findMemberByUserId,
	type PermissionCtx,
} from "@dokploy/server/services/permission";
import {
	assertHostScheduleAccess,
	createSchedule,
	deleteSchedule,
	findScheduleById,
	updateSchedule,
} from "@dokploy/server/services/schedule";
import { findServerById } from "@dokploy/server/services/server";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { assertScheduledJobLimit } from "@/server/api/utils/plan-limits";
import { removeJob, schedule, updateJob } from "@/server/utils/backup";
import { createTRPCRouter, protectedProcedure } from "../trpc";

type ScheduleTarget = {
	scheduleType?: Schedule["scheduleType"] | null;
	applicationId?: string | null;
	composeId?: string | null;
	serverId?: string | null;
};

// runCommand/deleteSchedule pick the target by scheduleType and fall back across
// applicationId/composeId/serverId, so every id stored on the row must be one
// the caller controls, not only the first one present.
const assertScheduleTargetAccess = async (
	ctx: PermissionCtx,
	target: ScheduleTarget,
	action: "create" | "update",
) => {
	await assertHostScheduleAccess(ctx, target.scheduleType, target.serverId);

	const serviceIds = [target.applicationId, target.composeId].filter(
		(id): id is string => !!id,
	);
	for (const serviceId of serviceIds) {
		await checkServicePermissionAndAccess(ctx, serviceId, {
			schedule: [action],
		});
	}
	if (serviceIds.length === 0) {
		await checkPermission(ctx, { schedule: [action] });
	}

	if (target.serverId) {
		const targetServer = await findServerById(target.serverId);
		if (targetServer.organizationId !== ctx.session.activeOrganizationId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this server.",
			});
		}
	}
};

const assertDokployServerScheduleOrganization = (
	ctx: { session: { activeOrganizationId: string } },
	schedule: Pick<Schedule, "scheduleType" | "organizationId">,
) => {
	if (
		schedule.scheduleType === "dokploy-server" &&
		schedule.organizationId &&
		schedule.organizationId !== ctx.session.activeOrganizationId
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to this schedule.",
		});
	}
};

export const scheduleRouter = createTRPCRouter({
	create: protectedProcedure
		.input(createScheduleSchema)
		.mutation(async ({ input, ctx }) => {
			await assertScheduleTargetAccess(ctx, input, "create");

			const serviceId = input.applicationId || input.composeId;
			if (serviceId) {
				if (IS_CLOUD) {
					await assertScheduledJobLimit(
						ctx.session.activeOrganizationId,
						input.applicationId ? "application" : "compose",
						serviceId,
					);
				}
			} else if (
				IS_CLOUD &&
				input.scheduleType === "server" &&
				input.serverId
			) {
				await assertScheduledJobLimit(
					ctx.session.activeOrganizationId,
					"server",
					input.serverId,
				);
			}
			const newSchedule = await createSchedule({
				...input,
				...(input.scheduleType === "dokploy-server" && {
					organizationId: ctx.session.activeOrganizationId,
				}),
			});

			if (newSchedule?.enabled) {
				if (IS_CLOUD) {
					await schedule({
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

			await assertHostScheduleAccess(
				ctx,
				existingSchedule.scheduleType,
				existingSchedule.serverId,
			);
			assertDokployServerScheduleOrganization(ctx, existingSchedule);

			const serviceId =
				existingSchedule.applicationId || existingSchedule.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					schedule: ["update"],
				});
			} else {
				await checkPermission(ctx, { schedule: ["update"] });
			}
			await assertScheduleTargetAccess(
				ctx,
				{
					scheduleType: input.scheduleType ?? existingSchedule.scheduleType,
					applicationId: input.applicationId ?? existingSchedule.applicationId,
					composeId: input.composeId ?? existingSchedule.composeId,
					serverId: input.serverId ?? existingSchedule.serverId,
				},
				"update",
			);
			const updatedSchedule = await updateSchedule(input);

			if (IS_CLOUD) {
				if (updatedSchedule?.enabled) {
					await updateJob({
						scheduleId: updatedSchedule.scheduleId,
						type: "schedule",
						cronSchedule: updatedSchedule.cronExpression,
						timezone: updatedSchedule.timezone,
					});
				} else {
					await removeJob({
						cronSchedule: existingSchedule.cronExpression,
						scheduleId: updatedSchedule.scheduleId,
						type: "schedule",
						timezone: existingSchedule.timezone,
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
			await assertHostScheduleAccess(
				ctx,
				scheduleItem.scheduleType,
				scheduleItem.serverId,
			);
			assertDokployServerScheduleOrganization(ctx, scheduleItem);

			const serviceId = scheduleItem.applicationId || scheduleItem.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					schedule: ["delete"],
				});
			} else {
				await checkPermission(ctx, { schedule: ["delete"] });
			}
			await deleteSchedule(input.scheduleId);

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
					const targetServer = await findServerById(input.id);
					if (
						targetServer.organizationId !== ctx.session.activeOrganizationId
					) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this server.",
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
						message: "Only owners and admins can list host-level schedules.",
					});
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
					application: {
						columns: {
							applicationId: true,
							appName: true,
							name: true,
							serverId: true,
						},
					},
					server: true,
					compose: {
						columns: {
							composeId: true,
							appName: true,
							name: true,
							serverId: true,
						},
					},
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

				if (schedule.scheduleType === "server" && schedule.serverId) {
					const targetServer = await findServerById(schedule.serverId);
					if (
						targetServer.organizationId !== ctx.session.activeOrganizationId
					) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this schedule.",
						});
					}
				}
			}
			await assertHostScheduleAccess(
				ctx,
				schedule.scheduleType,
				schedule.serverId,
			);
			assertDokployServerScheduleOrganization(ctx, schedule);
			return schedule;
		}),

	runManually: protectedProcedure
		.input(z.object({ scheduleId: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			const scheduleItem = await findScheduleById(input.scheduleId);
			await assertHostScheduleAccess(
				ctx,
				scheduleItem.scheduleType,
				scheduleItem.serverId,
			);
			assertDokployServerScheduleOrganization(ctx, scheduleItem);

			const serviceId = scheduleItem.applicationId || scheduleItem.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					schedule: ["create"],
				});
			} else {
				await checkPermission(ctx, { schedule: ["create"] });
			}
			try {
				const deployment = await runCommand(input.scheduleId);
				await audit(ctx, {
					action: "run",
					resourceType: "schedule",
					resourceId: input.scheduleId,
				});
				return {
					status: deployment.status,
					deploymentId: deployment.deploymentId,
					logPath: deployment.logPath,
				};
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Error running schedule",
				});
			}
		}),
});
