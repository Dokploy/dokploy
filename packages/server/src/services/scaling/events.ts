import { db } from "@dokploy/server/db";
import { scalingEvents } from "@dokploy/server/db/schema";
import { and, desc, eq } from "drizzle-orm";

export type NewScalingEvent = typeof scalingEvents.$inferInsert;

/** Who asked for a replica change; the autoscaler also says why. */
export interface ScaleTrigger {
	source: "manual" | "autoscaler";
	reason?: string;
	details?: Record<string, unknown>;
}

export const MANUAL_TRIGGER: ScaleTrigger = { source: "manual" };

export const recordScalingEvent = async (event: NewScalingEvent) => {
	const [row] = await db.insert(scalingEvents).values(event).returning();
	return row;
};

export type ScalingEventOwner =
	| { applicationId: string }
	| { composeId: string; serviceName?: string };

const ownerFilter = (owner: ScalingEventOwner) => {
	if ("applicationId" in owner) {
		return eq(scalingEvents.applicationId, owner.applicationId);
	}
	return owner.serviceName
		? and(
				eq(scalingEvents.composeId, owner.composeId),
				eq(scalingEvents.serviceName, owner.serviceName),
			)
		: eq(scalingEvents.composeId, owner.composeId);
};

export const findScalingEvents = async ({
	limit,
	offset,
	...owner
}: ScalingEventOwner & { limit: number; offset: number }) => {
	const where = ownerFilter(owner as ScalingEventOwner);
	const [events, total] = await Promise.all([
		db.query.scalingEvents.findMany({
			where,
			orderBy: [desc(scalingEvents.createdAt)],
			limit,
			offset,
			with: {
				user: { columns: { email: true, firstName: true, lastName: true } },
			},
		}),
		db.$count(scalingEvents, where),
	]);
	return { events, total };
};
