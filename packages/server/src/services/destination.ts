import { db } from "@dokploy/server/db";
import {
	type apiCreateDestination,
	destinations,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

export type Destination = typeof destinations.$inferSelect;

export const createDestintation = async (
	input: typeof apiCreateDestination._type,
	adminId: string,
) => {
	const newDestination = await db
		.insert(destinations)
		.values({
			...input,
			adminId: adminId,
		})
		.returning()
		.then((value) => value[0]);

	if (!newDestination) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting destination",
		});
	}

	return newDestination;
};

export const findDestinationById = async (destinationId: string) => {
	const destination = await db.query.destinations.findFirst({
		where: and(eq(destinations.destinationId, destinationId)),
	});
	if (!destination) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Destination not found",
		});
	}
	return destination;
};

export const removeDestinationById = async (
	destinationId: string,
	adminId: string,
) => {
	const result = await db
		.delete(destinations)
		.where(
			and(
				eq(destinations.destinationId, destinationId),
				eq(destinations.adminId, adminId),
			),
		)
		.returning();

	return result[0];
};

export const updateDestinationById = async (
	destinationId: string,
	destinationData: Partial<Destination>,
) => {
	const result = await db
		.update(destinations)
		.set({
			...destinationData,
		})
		.where(
			and(
				eq(destinations.destinationId, destinationId),
				eq(destinations.adminId, destinationData.adminId || ""),
			),
		)
		.returning();

	return result[0];
};
