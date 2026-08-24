import { db } from "@dokploy/server/db";
import { type apiCreatePort, ports } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { execAsync, execAsyncRemote } from "@dokploy/server/utils/process/execAsync";

export type Port = typeof ports.$inferSelect;

export const createPort = async (input: z.infer<typeof apiCreatePort>) => {
	const newPort = await db
		.insert(ports)
		.values({
			...input,
		})
		.returning()
		.then((value) => value[0]);

	if (!newPort) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting port",
		});
	}

	return newPort;
};

export const finPortById = async (portId: string) => {
	const result = await db.query.ports.findFirst({
		where: eq(ports.portId, portId),
		with: {
			application: {
				columns: {
					applicationId: true,
				},
			},
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Port not found",
		});
	}
	return result;
};

export const removePortById = async (portId: string) => {
	const result = await db
		.delete(ports)
		.where(eq(ports.portId, portId))
		.returning();

	return result[0];
};

export const checkPortInUse = async (
	port: number,
	serverId?: string | null,
) => {
	try {
		const command = `docker ps --filter "publish=${port}" --format '{{json .}}'`;
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		const firstContainer = stdout.trim().split("\n")[0];
		if (!firstContainer) {
			return {
				isInUse: false,
				conflictingContainer: null,
			};
		}

		const container = JSON.parse(firstContainer) as {
			ID?: string;
			Names?: string;
		};

		return {
			isInUse: true,
			conflictingContainer: container.Names || container.ID || null,
		};
	} catch {
		return {
			isInUse: false,
			conflictingContainer: null,
		};
	}
};

export const updatePortById = async (
	portId: string,
	portData: Partial<Port>,
) => {
	const result = await db
		.update(ports)
		.set({
			...portData,
		})
		.where(eq(ports.portId, portId))
		.returning();

	return result[0];
};
