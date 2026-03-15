import { db } from "@dokploy/server/db";
import { auditLog } from "@dokploy/server/db/schema";
import type { AuditAction, AuditResourceType } from "@dokploy/server/db/schema";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";

export type { AuditAction, AuditResourceType };

export interface CreateAuditLogInput {
	organizationId: string;
	userId: string;
	userEmail: string;
	userRole: string;
	action: AuditAction;
	resourceType: AuditResourceType;
	resourceId?: string;
	resourceName?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Creates an audit log entry. Fire-and-forget safe — errors are swallowed
 * so a logging failure never breaks the main operation.
 */
export const createAuditLog = async (input: CreateAuditLogInput) => {
	try {
		const licensed = await hasValidLicense(input.organizationId);
		if (!licensed) return;

		await db.insert(auditLog).values({
			organizationId: input.organizationId,
			userId: input.userId,
			userEmail: input.userEmail,
			userRole: input.userRole,
			action: input.action,
			resourceType: input.resourceType,
			resourceId: input.resourceId,
			resourceName: input.resourceName,
			metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
		});
	} catch (err) {
		console.error("[audit-log] Failed to create audit log entry:", err);
	}
};

export interface GetAuditLogsInput {
	organizationId: string;
	userId?: string;
	userEmail?: string;
	resourceName?: string;
	action?: AuditAction;
	resourceType?: AuditResourceType;
	from?: Date;
	to?: Date;
	limit?: number;
	offset?: number;
}

export const getAuditLogs = async (input: GetAuditLogsInput) => {
	const {
		organizationId,
		userId,
		userEmail,
		resourceName,
		action,
		resourceType,
		from,
		to,
		limit = 50,
		offset = 0,
	} = input;

	const conditions = [eq(auditLog.organizationId, organizationId)];

	if (userId) conditions.push(eq(auditLog.userId, userId));
	if (userEmail) conditions.push(ilike(auditLog.userEmail, `%${userEmail}%`));
	if (resourceName) conditions.push(ilike(auditLog.resourceName, `%${resourceName}%`));
	if (action) conditions.push(eq(auditLog.action, action));
	if (resourceType) conditions.push(eq(auditLog.resourceType, resourceType));
	if (from) conditions.push(gte(auditLog.createdAt, from));
	if (to) conditions.push(lte(auditLog.createdAt, to));

	const [logs, total] = await Promise.all([
		db.query.auditLog.findMany({
			where: and(...conditions),
			orderBy: [desc(auditLog.createdAt)],
			limit,
			offset,
		}),
		db.$count(auditLog, and(...conditions)),
	]);

	return { logs, total };
};
