import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
	type NewServiceMigration,
	type ServiceMigration,
	serviceMigrations,
} from "../db/schema";
import { execAsyncRemote } from "../utils/process/execAsync";

/**
 * Create a new service migration job
 */
export const createServiceMigration = async (
	input: NewServiceMigration,
): Promise<ServiceMigration> => {
	const result = await db.insert(serviceMigrations).values(input).returning();

	if (!result[0]) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to create migration job",
		});
	}

	return result[0];
};

/**
 * Find a migration by ID
 */
export const findServiceMigrationById = async (
	migrationId: string,
): Promise<ServiceMigration> => {
	const result = await db.query.serviceMigrations.findFirst({
		where: eq(serviceMigrations.migrationId, migrationId),
		with: {
			sourceServer: true,
			targetServer: true,
			initiator: true,
		},
	});

	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Migration not found",
		});
	}

	return result;
};

/**
 * Update migration status and progress
 */
export const updateServiceMigration = async (
	migrationId: string,
	data: Partial<ServiceMigration>,
): Promise<ServiceMigration> => {
	const result = await db
		.update(serviceMigrations)
		.set(data)
		.where(eq(serviceMigrations.migrationId, migrationId))
		.returning();

	if (!result[0]) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Migration not found",
		});
	}

	return result[0];
};

/**
 * Get all migrations for a service
 */
export const findMigrationsByServiceId = async (
	serviceId: string,
): Promise<ServiceMigration[]> => {
	return await db.query.serviceMigrations.findMany({
		where: eq(serviceMigrations.serviceId, serviceId),
		with: {
			sourceServer: true,
			targetServer: true,
		},
		orderBy: (migrations, { desc }) => [desc(migrations.startedAt)],
	});
};

/**
 * Validate target server is accessible and has Docker
 */
export const validateTargetServer = async (
	serverId: string,
): Promise<{ valid: boolean; error?: string }> => {
	try {
		// Test SSH connection
		const result = await execAsyncRemote(serverId, "echo 'test'");
		if (!result) {
			return { valid: false, error: "Cannot connect to server via SSH" };
		}

		// Check Docker is installed
		const dockerCheck = await execAsyncRemote(
			serverId,
			"docker --version",
		).catch(() => null);

		if (!dockerCheck) {
			return {
				valid: false,
				error: "Docker is not installed on target server",
			};
		}

		// Check Docker is running
		const dockerRunning = await execAsyncRemote(serverId, "docker ps").catch(
			() => null,
		);

		if (!dockerRunning) {
			return {
				valid: false,
				error: "Docker is not running on target server",
			};
		}

		return { valid: true };
	} catch (error) {
		return {
			valid: false,
			error: `Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
};

/**
 * Check if target server has enough resources
 */
export const checkServerResources = async (
	serverId: string,
): Promise<{
	diskSpace: string;
	memory: string;
	cpu: string;
}> => {
	try {
		// Check disk space
		const diskSpace = await execAsyncRemote(
			serverId,
			"df -h / | tail -1 | awk '{print $4}'",
		);

		// Check memory
		const memory = await execAsyncRemote(
			serverId,
			"free -h | grep Mem | awk '{print $7}'",
		);

		// Get CPU info
		const cpu = await execAsyncRemote(serverId, "nproc");

		return {
			diskSpace: diskSpace?.stdout.trim() || "Unknown",
			memory: memory?.stdout.trim() || "Unknown",
			cpu: cpu?.stdout.trim() || "Unknown",
		};
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to check server resources",
		});
	}
};

/**
 * Mark migration as failed
 */
export const failMigration = async (
	migrationId: string,
	errorMessage: string,
): Promise<void> => {
	await updateServiceMigration(migrationId, {
		status: "failed",
		errorMessage,
		completedAt: new Date().toISOString(),
	});
};

/**
 * Mark migration as completed
 */
export const completeMigration = async (migrationId: string): Promise<void> => {
	await updateServiceMigration(migrationId, {
		status: "completed",
		completedAt: new Date().toISOString(),
	});
};
