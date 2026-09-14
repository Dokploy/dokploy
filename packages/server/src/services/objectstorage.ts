import { db } from "@dokploy/server/db";
import {
	type apiCreateObjectStorage,
	buildAppName,
	objectstorage,
} from "@dokploy/server/db/schema";
import { generatePassword } from "@dokploy/server/templates";
import { buildObjectStorage } from "@dokploy/server/utils/databases/objectstorage";
import {
	pullImage,
	waitForSwarmServiceConvergence,
} from "@dokploy/server/utils/docker/utils";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import { validUniqueServerAppName } from "./project";

export type ObjectStorage = typeof objectstorage.$inferSelect;

export function getObjectStorageMountPath(provider: string): string {
	if (provider === "minio") {
		return "/data";
	}
	if (provider === "garage") {
		return "/var/lib/garage/data";
	}
	if (provider === "alarik") {
		return "/app/Storage";
	}
	return "/data";
}

export const createObjectStorage = async (
	input: z.infer<typeof apiCreateObjectStorage>,
) => {
	const appName = buildAppName("objectstorage", input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Service with this 'AppName' already exists",
		});
	}

	const newObjectStorage = await db
		.insert(objectstorage)
		.values({
			...input,
			rootPassword: input.rootPassword || generatePassword(),
			rootUser: input.rootUser || "minioadmin",
			appName,
		})
		.returning()
		.then((value) => value[0]);

	if (!newObjectStorage) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting object storage",
		});
	}

	return newObjectStorage;
};

export const findObjectStorageById = async (objectStorageId: string) => {
	const result = await db.query.objectstorage.findFirst({
		where: eq(objectstorage.objectStorageId, objectStorageId),
		with: {
			environment: {
				with: {
					project: true,
				},
			},
			mounts: true,
			server: true,
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Object Storage not found",
		});
	}
	return result;
};

export const updateObjectStorageById = async (
	objectStorageId: string,
	objectStorageData: Partial<ObjectStorage>,
) => {
	const { appName, ...rest } = objectStorageData;
	const result = await db
		.update(objectstorage)
		.set({
			...rest,
		})
		.where(eq(objectstorage.objectStorageId, objectStorageId))
		.returning();

	return result[0];
};

export const removeObjectStorageById = async (objectStorageId: string) => {
	const result = await db
		.delete(objectstorage)
		.where(eq(objectstorage.objectStorageId, objectStorageId))
		.returning();

	return result[0];
};

export const deployObjectStorage = async (
	objectStorageId: string,
	onData?: (data: string) => void,
) => {
	const os = await findObjectStorageById(objectStorageId);
	try {
		await updateObjectStorageById(objectStorageId, {
			applicationStatus: "running",
		});

		onData?.("Starting object storage deployment...");

		if (os.serverId) {
			await execAsyncRemote(
				os.serverId,
				`docker pull ${quote([os.dockerImage])}`,
				onData,
			);
		} else {
			await pullImage(os.dockerImage, onData);
		}

		onData?.("Building object storage container...");
		await buildObjectStorage(os);

		await waitForSwarmServiceConvergence(os.appName, os.serverId);

		await updateObjectStorageById(objectStorageId, {
			applicationStatus: "done",
		});

		onData?.("Deployment completed successfully!");
	} catch (error) {
		console.error("Error deploying object storage:", error);
		onData?.("Deployment failed. Check the server logs for details.");
		await updateObjectStorageById(objectStorageId, {
			applicationStatus: "error",
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Error on deploy object storage",
		});
	}
	return os;
};
