import { db } from "@dokploy/server/db";
import {
	cloudProviderCredentials,
	serverProvisioningJob,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { encryptToken, decryptToken } from "../providers/encryption";
import { createCloudProvider } from "../providers/factory";
import {
	CloudProvider,
	ProvisioningStatus,
	type ProviderCredentials,
	type ServerConfig,
} from "../providers/types";

export type CloudProviderCredential =
	typeof cloudProviderCredentials.$inferSelect;
export type ServerProvisioningJob = typeof serverProvisioningJob.$inferSelect;

/**
 * Create or update cloud provider credentials
 */
export const upsertProviderCredentials = async (
	organizationId: string,
	provider: CloudProvider,
	apiToken: string,
	config?: Record<string, unknown>,
) => {
	const providerClient = createCloudProvider(provider, {
		provider,
		apiToken,
		additionalConfig: config || {},
	});
	const isValid = await providerClient.validateToken();

	if (!isValid) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid API token for ${provider}`,
		});
	}

	const encryptedToken = encryptToken(apiToken);

	const existing = await db.query.cloudProviderCredentials.findFirst({
		where: and(
			eq(cloudProviderCredentials.organizationId, organizationId),
			eq(cloudProviderCredentials.provider, provider),
		),
	});

	if (existing) {
		const updated = await db
			.update(cloudProviderCredentials)
			.set({
				encryptedApiToken: encryptedToken,
				additionalConfig: config || {},
				isValid: "valid",
				lastValidated: new Date(),
			})
			.where(eq(cloudProviderCredentials.credentialId, existing.credentialId))
			.returning()
			.then((res) => res[0]);

		return updated;
	}

	const newCredential = await db
		.insert(cloudProviderCredentials)
		.values({
			name: `${provider}-credentials`,
			organizationId,
			provider,
			encryptedApiToken: encryptedToken,
			additionalConfig: config || {},
			isValid: "valid",
			lastValidated: new Date(),
		})
		.returning()
		.then((res) => res[0]);

	return newCredential;
};

/**
 * Get credentials for a provider
 */
export const getProviderCredentials = async (
	organizationId: string,
	provider: CloudProvider,
): Promise<CloudProviderCredential | null> => {
	const credentials = await db.query.cloudProviderCredentials.findFirst({
		where: and(
			eq(cloudProviderCredentials.organizationId, organizationId),
			eq(cloudProviderCredentials.provider, provider),
		),
	});

	return credentials || null;
};

/**
 * Get decrypted API token for a provider
 */
export const getDecryptedApiToken = async (
	organizationId: string,
	provider: CloudProvider,
): Promise<string> => {
	const credentials = await getDecryptedProviderCredentials(
		organizationId,
		provider,
	);

	return credentials.apiToken;
};

export const getDecryptedProviderCredentials = async (
	organizationId: string,
	provider: CloudProvider,
): Promise<ProviderCredentials> => {
	const credentials = await getProviderCredentials(organizationId, provider);

	if (!credentials) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No credentials found for ${provider}`,
		});
	}

	return {
		provider,
		apiToken: decryptToken(credentials.encryptedApiToken),
		additionalConfig: credentials.additionalConfig || {},
	};
};

/**
 * Delete provider credentials
 */
export const deleteProviderCredentials = async (credentialId: string) => {
	const result = await db
		.delete(cloudProviderCredentials)
		.where(eq(cloudProviderCredentials.credentialId, credentialId))
		.returning()
		.then((res) => res[0]);

	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Credentials not found",
		});
	}

	return result;
};

/**
 * List all credentials for an organization
 */
export const listProviderCredentials = async (organizationId: string) => {
	const credentials = await db.query.cloudProviderCredentials.findMany({
		where: eq(cloudProviderCredentials.organizationId, organizationId),
		orderBy: desc(cloudProviderCredentials.createdAt),
	});

	return credentials.map((cred) => ({
		...cred,
		encryptedApiToken: undefined,
	}));
};

/**
 * Create a provisioning job
 */
export const createProvisioningJob = async (
	organizationId: string,
	_provider: CloudProvider,
	config: ServerConfig,
	credentialId: string,
) => {
	const job = await db
		.insert(serverProvisioningJob)
		.values({
			organizationId,
			credentialId,
			config,
			status: ProvisioningStatus.PENDING,
		})
		.returning()
		.then((res) => res[0]);

	if (!job) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to create provisioning job",
		});
	}

	return job;
};

/**
 * Update provisioning job status
 */
export const updateProvisioningJobStatus = async (
	jobId: string,
	status: ProvisioningStatus,
	error?: string,
	providerServerId?: string,
	serverId?: string,
	message?: string,
) => {
	const updated = await db
		.update(serverProvisioningJob)
		.set({
			status,
			error,
			message,
			providerServerId,
			serverId,
			...(status === ProvisioningStatus.COMPLETED ||
			status === ProvisioningStatus.FAILED
				? { completedAt: new Date() }
				: {}),
		})
		.where(eq(serverProvisioningJob.jobId, jobId))
		.returning()
		.then((res) => res[0]);

	return updated;
};

/**
 * Get provisioning job by ID
 */
export const getProvisioningJob = async (jobId: string) => {
	const job = await db.query.serverProvisioningJob.findFirst({
		where: eq(serverProvisioningJob.jobId, jobId),
	});

	if (!job) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Provisioning job not found",
		});
	}

	return job;
};

/**
 * List provisioning jobs for an organization
 */
export const listProvisioningJobs = async (organizationId: string) => {
	const jobs = await db.query.serverProvisioningJob.findMany({
		where: eq(serverProvisioningJob.organizationId, organizationId),
		orderBy: desc(serverProvisioningJob.createdAt),
	});

	return jobs;
};
