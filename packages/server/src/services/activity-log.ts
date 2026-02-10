import { db } from "@dokploy/server/db";
import { activityLogs } from "@dokploy/server/db/schema";
import { count, desc, eq, and, lt, sql } from "drizzle-orm";
import { z } from "zod";

export type ActivityLog = typeof activityLogs.$inferSelect;
export type CreateActivityLog = typeof activityLogs.$inferInsert;

export const recordActivity = async (data: CreateActivityLog) => {
	try {
		console.log("Recording activity:", data.action, data.resourceType);
		const [newLog] = await db.insert(activityLogs).values(data).returning();
		console.log("Activity log recorded successfully:", newLog.activityLogId);
		return newLog;
	} catch (error) {
		console.error("Failed to record activity log:", error);
		// We don't want to throw error here to avoid breaking the main operation
	}
};

export const getActivityLogs = async (
	input: z.infer<typeof apiFindAllActivityLogsSchema>,
) => {
	const { organizationId, userId, resourceType, resourceId, page, pageSize } =
		input;

	const where = [];

	if (organizationId) {
		where.push(eq(activityLogs.organizationId, organizationId));
	}
	if (userId) {
		where.push(eq(activityLogs.userId, userId));
	}
	if (resourceType) {
		where.push(eq(activityLogs.resourceType, resourceType));
	}
	if (resourceId) {
		where.push(eq(activityLogs.resourceId, resourceId));
	}

	const whereConditions = and(...where);

	const [totalCountResult] = await db
		.select({ value: count() })
		.from(activityLogs)
		.where(whereConditions);

	const logs = await db.query.activityLogs.findMany({
		where: whereConditions,
		orderBy: desc(activityLogs.createdAt),
		limit: pageSize,
		offset: (page - 1) * pageSize,
		with: {
			user: {
				columns: {
					email: true,
					id: true,
				},
			},
		},
	});

	return {
		logs,
		totalCount: Number(totalCountResult?.value || 0),
	};
};

export const apiFindAllActivityLogsSchema = z.object({
	organizationId: z.string().optional(),
	userId: z.string().optional(),
	resourceType: z.string().optional(),
	resourceId: z.string().optional(),
	page: z.number().default(1),
	pageSize: z.number().default(50),
});

export const apiPurgeActivityLogsSchema = z.object({
	organizationId: z.string().optional(),
	days: z.number().min(0),
});

export const purgeActivityLogs = async (
	input: z.infer<typeof apiPurgeActivityLogsSchema>,
) => {
	const { organizationId, days } = input;

	const date = new Date();
	date.setDate(date.getDate() - days);

	const result = await db
		.delete(activityLogs)
		.where(
			and(
				eq(activityLogs.organizationId, organizationId),
				lt(activityLogs.createdAt, date.toISOString()),
			),
		)
		.returning();

	return result.length;
};
