import { db } from "@dokploy/server/db";
import {
	environments,
	member,
	organization,
	schedules,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getCurrentPlan, getCurrentPlanForUser } from "@/server/utils/billing";

export type PlanLimitResource =
	| "organization"
	| "member"
	| "environment"
	| "volumeBackup"
	| "databaseBackup"
	| "scheduledJob";

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLAN_LIMITS: Record<
	"hobby" | "startup" | "legacy",
	Record<PlanLimitResource, number>
> = {
	hobby: {
		organization: 1,
		member: 1,
		environment: 2,
		volumeBackup: 1,
		databaseBackup: 1,
		scheduledJob: 1,
	},
	startup: {
		organization: 3,
		member: UNLIMITED,
		environment: UNLIMITED,
		volumeBackup: UNLIMITED,
		databaseBackup: UNLIMITED,
		scheduledJob: UNLIMITED,
	},
	legacy: {
		organization: UNLIMITED,
		member: UNLIMITED,
		environment: UNLIMITED,
		volumeBackup: UNLIMITED,
		databaseBackup: UNLIMITED,
		scheduledJob: UNLIMITED,
	},
};

const resourceLabels: Record<PlanLimitResource, string> = {
	organization: "organizations",
	member: "users",
	environment: "environments per project",
	volumeBackup: "volume backups per application",
	databaseBackup: "backups per database",
	scheduledJob: "scheduled jobs per service",
};

const assertLimitForPlan = (
	plan: "hobby" | "startup" | "legacy" | null,
	resource: PlanLimitResource,
	currentCount: number,
) => {
	const limit = PLAN_LIMITS[plan ?? "legacy"][resource];

	if (currentCount >= limit) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `You've reached your plan's limit of ${limit} ${resourceLabels[resource]}. Upgrade your plan to add more.`,
		});
	}
};

export const assertOrganizationLimit = async (userId: string) => {
	const plan = await getCurrentPlanForUser(userId);
	const organizations = await db.query.organization.findMany({
		where: eq(organization.ownerId, userId),
	});
	assertLimitForPlan(plan, "organization", organizations.length);
};

export const assertMemberLimit = async (organizationId: string) => {
	const plan = await getCurrentPlan(organizationId);
	const members = await db.query.member.findMany({
		where: eq(member.organizationId, organizationId),
	});
	assertLimitForPlan(plan, "member", members.length);
};

export const assertEnvironmentLimit = async (
	organizationId: string,
	projectId: string,
) => {
	const plan = await getCurrentPlan(organizationId);
	const envs = await db.query.environments.findMany({
		where: eq(environments.projectId, projectId),
	});
	assertLimitForPlan(plan, "environment", envs.length);
};

export const assertVolumeBackupLimit = async (
	organizationId: string,
	currentCount: number,
) => {
	const plan = await getCurrentPlan(organizationId);
	assertLimitForPlan(plan, "volumeBackup", currentCount);
};

export const assertDatabaseBackupLimit = async (
	organizationId: string,
	currentCount: number,
) => {
	const plan = await getCurrentPlan(organizationId);
	assertLimitForPlan(plan, "databaseBackup", currentCount);
};

export const assertScheduledJobLimit = async (
	organizationId: string,
	scheduleType: "application" | "compose" | "server",
	serviceId: string,
) => {
	const plan = await getCurrentPlan(organizationId);
	const column = `${scheduleType}Id` as const;
	const rows = await db.query.schedules.findMany({
		where: eq(schedules[column], serviceId),
	});
	assertLimitForPlan(plan, "scheduledJob", rows.length);
};
