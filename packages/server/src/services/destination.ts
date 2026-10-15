import { db } from "@dokploy/server/db";
import {
	type apiCreateDestination,
	destinations,
} from "@dokploy/server/db/schema";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import { IS_CLOUD } from "../constants";

export type Destination = typeof destinations.$inferSelect;

export const testDestinationConnection = async (input: {
	accessKey: string;
	secretAccessKey: string;
	bucket: string;
	region: string;
	endpoint: string;
	provider?: string | null;
	additionalFlags?: string[] | null;
	serverId?: string | null;
}): Promise<void> => {
	const rcloneFlags = [
		`--s3-access-key-id=${quote([input.accessKey])}`,
		`--s3-secret-access-key=${quote([input.secretAccessKey])}`,
		`--s3-region=${quote([input.region])}`,
		`--s3-endpoint=${quote([input.endpoint])}`,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
		"--retries 1",
		"--low-level-retries 1",
		"--timeout 10s",
		"--contimeout 5s",
	];
	if (input.provider) {
		rcloneFlags.unshift(`--s3-provider=${quote([input.provider])}`);
	}
	if (input.additionalFlags?.length) {
		rcloneFlags.push(...input.additionalFlags);
	}
	const rcloneDestination = `:s3:${input.bucket}`;
	const rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} ${quote([rcloneDestination])}`;

	if (IS_CLOUD) {
		if (!input.serverId) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
		}
		await execAsyncRemote(input.serverId, rcloneCommand);
		return;
	}

	await execAsync(rcloneCommand);
};

export const createDestination = async (
	input: z.infer<typeof apiCreateDestination>,
	organizationId: string,
) => {
	const newDestination = await db
		.insert(destinations)
		.values({
			...input,
			organizationId: organizationId,
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
	organizationId: string,
) => {
	const result = await db
		.delete(destinations)
		.where(
			and(
				eq(destinations.destinationId, destinationId),
				eq(destinations.organizationId, organizationId),
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
				eq(destinations.organizationId, destinationData.organizationId || ""),
			),
		)
		.returning();

	return result[0];
};
