import { db } from "@dokploy/server/db";
import {
	type apiCreateDestination,
	destinations,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { findAdmin } from "./admin";

export type Destination = typeof destinations.$inferSelect;

export const createDestintation = async (
	input: typeof apiCreateDestination._type,
) => {
	const adminResponse = await findAdmin();
	const newDestination = await db
		.insert(destinations)
		.values({
			...input,
			adminId: adminResponse.adminId,
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
		where: eq(destinations.destinationId, destinationId),
	});
	if (!destination) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Destination not found",
		});
	}
	return destination;
};

export const removeDestinationById = async (destinationId: string) => {
	const result = await db
		.delete(destinations)
		.where(eq(destinations.destinationId, destinationId))
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
		.where(eq(destinations.destinationId, destinationId))
		.returning();

	return result[0];
};
