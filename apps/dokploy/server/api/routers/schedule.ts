import { IS_CLOUD, removeScheduleJob, scheduleJob } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { member } from "@dokploy/server/db/schema";
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
import { findServerById } from "@dokploy/server/services/server";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { removeJob, schedule } from "@/server/utils/backup";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const scheduleRouter = createTRPCRouter({
	create: protectedProcedure
		.input(createScheduleSchema)
		.mutation(async ({ input, ctx }) => {
			const serviceId = input.applicationId || input.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					schedule: ["create"],
				});
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
					const targetServer = await findServerById(input.serverId);
					if (
						targetServer.organizationId !== ctx.session.activeOrganizationId
					) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this server.",
						});
					}
				}
			}
			const newSchedule = await createSchedule(input);

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
				if (existingSchedule.scheduleType === "dokploy-server" && IS_CLOUD) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message:
							"Host-level schedules are not available in the cloud version.",
					});
				}

				await checkPermission(ctx, { schedule: ["update"] });

				if (
					existingSchedule.scheduleType === "server" ||
					existingSchedule.scheduleType === "dokploy-server"
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

				if (
					existingSchedule.scheduleType === "server" &&
					existingSchedule.serverId
				) {
					const targetServer = await findServerById(existingSchedule.serverId);
					if (
						targetServer.organizationId !== ctx.session.activeOrganizationId
					) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this server.",
						});
					}
				}

			if (
				existingSchedule.scheduleType === "dokploy-server" &&
				existingSchedule.userId &&
				existingSchedule.userId !== ctx.user.id
			) {
				// Admin/owner role already verified above.
				// Don't use findMemberByUserId here — it would throw if the
				// schedule owner left the org, making the schedule unmanageable.
				const scheduleOwnerInOrg = await db.query.member.findFirst({
					where: and(
						eq(member.userId, existingSchedule.userId),
						eq(member.organizationId, ctx.session.activeOrganizationId),
					),
					columns: { id: true },
				});
				if (scheduleOwnerInOrg) {
					// Owner is still in org — allowed.
				}
				// If owner left the org, still allow the admin/owner to manage it.
			}
			}
			const updatedSchedule = await updateSchedule(input);

			if (IS_CLOUD) {
				if (updatedSchedule?.enabled) {
					schedule({
						scheduleId: updatedSchedule.scheduleId,
						type: "schedule",
						cronSchedule: updatedSchedule.cronExpression,
						timezone: updatedSchedule.timezone,
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
				if (scheduleItem.scheduleType === "dokploy-server" && IS_CLOUD) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message:
							"Host-level schedules are not available in the cloud version.",
					});
				}

				await checkPermission(ctx, { schedule: ["delete"] });

				if (
					scheduleItem.scheduleType === "server" ||
					scheduleItem.scheduleType === "dokploy-server"
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

				if (scheduleItem.scheduleType === "server" && scheduleItem.serverId) {
					const targetServer = await findServerById(scheduleItem.serverId);
					if (
						targetServer.organizationId !== ctx.session.activeOrganizationId
					) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this server.",
						});
					}
				}

				if (
					scheduleItem.scheduleType === "dokploy-server" &&
					scheduleItem.userId &&
					scheduleItem.userId !== ctx.user.id
				) {
					// Admin/owner role already verified above.
					// Don't throw if the schedule owner left the org.
					const scheduleOwnerInOrg = await db.query.member.findFirst({
						where: and(
							eq(member.userId, scheduleItem.userId),
							eq(member.organizationId, ctx.session.activeOrganizationId),
						),
						columns: { id: true },
					});
					if (scheduleOwnerInOrg) {
						// Owner is still in org — allowed.
					}
				}
			}
			await deleteSchedule(input.scheduleId);

			if (IS_CLOUD) {
				await removeJob({
					cronSchedule: scheduleItem.cronExpression,
					scheduleId: scheduleItem.scheduleId,
					type: "schedule",
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
			}

		let listWhere;
		if (input.scheduleType === "dokploy-server") {
			const currentMember = await findMemberByUserId(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			if (
				currentMember.role === "owner" ||
				currentMember.role === "admin"
			) {
				const orgMembers = await db.query.member.findMany({
					where: eq(member.organizationId, ctx.session.activeOrganizationId),
					columns: { userId: true },
				});
				const userIds = orgMembers.map((m) => m.userId);
				if (userIds.length === 0) {
					return [];
				}
				listWhere = and(
					eq(schedules.scheduleType, "dokploy-server"),
					inArray(schedules.userId, userIds),
				);
			} else {
				listWhere = eq(schedules.userId, ctx.user.id);
			}
		} else {
			const where = {
				application: eq(schedules.applicationId, input.id),
				compose: eq(schedules.composeId, input.id),
				server: eq(schedules.serverId, input.id),
			};
			listWhere = where[input.scheduleType];
		}
		return db.query.schedules.findMany({
			where: listWhere,
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

				if (
					schedule.scheduleType === "dokploy-server" &&
					schedule.userId &&
					schedule.userId !== ctx.user.id
				) {
					const currentMember = await findMemberByUserId(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);
					if (
						currentMember.role !== "owner" &&
						currentMember.role !== "admin"
					) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this schedule.",
						});
					}
					// Don't throw if the schedule owner left the org.
					const scheduleOwnerInOrg = await db.query.member.findFirst({
						where: and(
							eq(member.userId, schedule.userId),
							eq(member.organizationId, ctx.session.activeOrganizationId),
						),
						columns: { id: true },
					});
					if (scheduleOwnerInOrg) {
						// Owner is still in org — allowed.
					}
				}
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
				if (scheduleItem.scheduleType === "dokploy-server" && IS_CLOUD) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message:
							"Host-level schedules are not available in the cloud version.",
					});
				}

				await checkPermission(ctx, { schedule: ["create"] });

				if (
					scheduleItem.scheduleType === "server" ||
					scheduleItem.scheduleType === "dokploy-server"
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

				if (scheduleItem.scheduleType === "server" && scheduleItem.serverId) {
					const targetServer = await findServerById(scheduleItem.serverId);
					if (
						targetServer.organizationId !== ctx.session.activeOrganizationId
					) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this server.",
						});
					}
				}

				if (
					scheduleItem.scheduleType === "dokploy-server" &&
					scheduleItem.userId &&
					scheduleItem.userId !== ctx.user.id
				) {
					// Admin/owner role already verified above.
					// Don't throw if the schedule owner left the org.
					const scheduleOwnerInOrg = await db.query.member.findFirst({
						where: and(
							eq(member.userId, scheduleItem.userId),
							eq(member.organizationId, ctx.session.activeOrganizationId),
						),
						columns: { id: true },
					});
					if (scheduleOwnerInOrg) {
						// Owner is still in org — allowed.
					}
				}
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
