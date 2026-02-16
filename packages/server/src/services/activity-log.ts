import { db } from "@dokploy/server/db";
import { activityLogs } from "@dokploy/server/db/schema";
import { count, desc, eq, and, lt, sql } from "drizzle-orm";
import { z } from "zod";

export type ActivityLog = typeof activityLogs.$inferSelect;
export type CreateActivityLog = typeof activityLogs.$inferInsert;

const EXACT_SENSITIVE_FIELDS = ["key", "env"];
const SUBSTRING_SENSITIVE_FIELDS = [
	"password",
	"token",
	"secret",
	"privatekey",
	"sshkey",
	"apikey",
	"buildargs",
];

const redactSensitive = (obj: any): any => {
	if (!obj || typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map(redactSensitive);

	const newObj = { ...obj };
	for (const key in newObj) {
		const lowerKey = key.toLowerCase();
		const isExactMatch = EXACT_SENSITIVE_FIELDS.includes(lowerKey);
		const isSubstringMatch = SUBSTRING_SENSITIVE_FIELDS.some((field) =>
			lowerKey.includes(field),
		);

		if (isExactMatch || isSubstringMatch) {
			newObj[key] = "[REDACTED]";
		} else if (typeof newObj[key] === "object") {
			newObj[key] = redactSensitive(newObj[key]);
		}
	}
	return newObj;
};

export const recordActivity = async (data: CreateActivityLog) => {
	try {
		const redactedData = {
			...data,
			metadata: redactSensitive(data.metadata),
		};
		const [newLog] = await db
			.insert(activityLogs)
			.values(redactedData)
			.returning();
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
	pageSize: z.number().default(50).pipe(z.number().max(100)),
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

	const where = [lt(activityLogs.createdAt, date)];

	if (organizationId) {
		where.push(eq(activityLogs.organizationId, organizationId));
	}

	const result = await db
		.delete(activityLogs)
		.where(and(...where))
		.returning();

	return result.length;
};
