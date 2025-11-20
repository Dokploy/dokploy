import { db } from "@dokploy/server/db";
import {
	cloudProviderCredentials,
	serverProvisioningJob,
	server,
	sshKeys,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import {
	type CloudProvider,
	ProvisioningStatus,
	type ServerConfig,
} from "../providers/types";
import { createCloudProvider } from "../providers/factory";
import { encryptToken, decryptToken } from "../providers/encryption";
import { createServer as createDokployServer } from "./server";
import { nanoid } from "nanoid";
import * as ssh2 from "ssh2";
import { serverSetup } from "../setup/server-setup";

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
	// Validate token with provider
	const providerClient = createCloudProvider(provider, apiToken);
	const isValid = await providerClient.validateToken();

	if (!isValid) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Invalid API token for ${provider}`,
		});
	}

	// Encrypt the token
	const encryptedToken = encryptToken(apiToken);

	// Check if credentials already exist
	const existing = await db.query.cloudProviderCredentials.findFirst({
		where: and(
			eq(cloudProviderCredentials.organizationId, organizationId),
			eq(cloudProviderCredentials.provider, provider),
		),
	});

	if (existing) {
		// Update existing
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

	// Create new
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
	const credentials = await getProviderCredentials(organizationId, provider);

	if (!credentials) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `No credentials found for ${provider}`,
		});
	}

	return decryptToken(credentials.encryptedApiToken);
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

	// Don't return encrypted tokens
	return credentials.map((cred) => ({
		...cred,
		encryptedApiToken: undefined,
	}));
};

/**
 * Generate SSH key pair for server provisioning
 */
const generateSSHKeyPair = (): Promise<{
	publicKey: string;
	privateKey: string;
}> => {
	return new Promise((resolve, reject) => {
		// Generate SSH key pair using ssh2 (generates in proper OpenSSH format)
		ssh2.utils.generateKeyPair(
			"rsa",
			{ bits: 4096, comment: "dokploy-provisioned" },
			(err, keys) => {
				if (err) {
					reject(err);
					return;
				}

				if (!keys || !keys.public || !keys.private) {
					reject(new Error("Failed to generate SSH key pair"));
					return;
				}

				resolve({
					publicKey: keys.public,
					privateKey: keys.private,
				});
			},
		);
	});
};

/**
 * Create a provisioning job
 */
export const createProvisioningJob = async (
	organizationId: string,
	provider: CloudProvider,
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

/**
 * Wait for SSH to be available on a server
 * Retries connection attempts until SSH is ready or timeout is reached
 */
const waitForSSH = async (
	host: string,
	port: number,
	username: string,
	privateKey: string,
	timeout = 300000, // 5 minutes
	onProgress?: (message: string) => void,
): Promise<void> => {
	const startTime = Date.now();
	const retryInterval = 10000; // 10 seconds between retries

	return new Promise((resolve, reject) => {
		const attemptConnection = () => {
			if (Date.now() - startTime > timeout) {
				reject(new Error(`SSH connection timeout after ${timeout}ms`));
				return;
			}

			const client = new ssh2.Client();

			client
				.once("ready", () => {
					onProgress?.("SSH connection successful!");
					client.end();
					resolve();
				})
				.once("error", (err) => {
					client.end();
					// Log the attempt and retry
					const elapsed = Math.floor((Date.now() - startTime) / 1000);
					onProgress?.(`Waiting for SSH (${elapsed}s)... ${err.message}`);

					// Wait and retry
					setTimeout(attemptConnection, retryInterval);
				})
				.connect({
					host,
					port,
					username,
					privateKey,
					readyTimeout: 20000, // 20 second timeout per attempt
				});
		};

		// Start first attempt
		attemptConnection();
	});
};

/**
 * Main provisioning orchestration function
 * This handles the complete flow: SSH key → upload → create server → setup Dokploy
 */
export const provisionServer = async (
	jobId: string,
	organizationId: string,
	credentialId: string,
	provider: CloudProvider,
	config: ServerConfig,
) => {
	let providerServerId: string | undefined;
	let sshKeyId: string | undefined;

	try {
		// Get API token
		const apiToken = await getDecryptedApiToken(organizationId, provider);
		const providerClient = createCloudProvider(provider, apiToken);

		// Update status: Generating SSH keys
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.GENERATING_SSH_KEY,
			undefined,
			undefined,
			undefined,
			"Generating 4096-bit RSA SSH key pair...",
		);

		// Generate SSH key pair
		const { publicKey, privateKey } = await generateSSHKeyPair();

		// Store SSH key in database
		const sshKey = await db
			.insert(sshKeys)
			.values({
				name: `${config.name}-key`,
				description: `Auto-generated key for ${config.name}`,
				publicKey,
				privateKey,
				organizationId,
			})
			.returning()
			.then((res) => res[0]);

		if (!sshKey) {
			throw new Error("Failed to create SSH key");
		}

		sshKeyId = sshKey.sshKeyId;

		// Update status: Uploading SSH key to provider
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.UPLOADING_SSH_KEY,
			undefined,
			undefined,
			undefined,
			`Uploading SSH key to ${provider}...`,
		);

		// Upload SSH key to provider
		const providerSSHKey = await providerClient.createSSHKey(
			`dokploy-${config.name}-${nanoid(6)}`,
			publicKey,
		);

		// Update status: Creating server
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.CREATING_SERVER,
			undefined,
			undefined,
			undefined,
			`Creating ${config.serverType} server in ${config.location}...`,
		);

		// Provision the server
		const provisionResult = await providerClient.provisionServer(config, [
			providerSSHKey.id,
		]);

		providerServerId = provisionResult.id;

		// Update job with provider server ID
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.CREATING_SERVER,
			undefined,
			providerServerId,
		);

		// Update status: Configuring Dokploy
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.CONFIGURING_DOKPLOY,
			undefined,
			providerServerId,
			undefined,
			`Creating Dokploy server record for ${provisionResult.ipAddress}...`,
		);

		// Create server entry in Dokploy
		const dokployServer = await createDokployServer(
			{
				name: config.name,
				description: `Provisioned via ${provider}`,
				ipAddress: provisionResult.ipAddress,
				port: 22,
				username: "root",
				sshKeyId: sshKeyId,
			},
			organizationId,
		);

		// Update server with cloud provider info
		await db
			.update(server)
			.set({
				cloudProvider: provider,
				providerServerId: providerServerId,
				providerMetadata: {
					location: config.location,
					serverType: config.serverType,
					image: config.image,
				},
			})
			.where(eq(server.serverId, dokployServer.serverId));

		// Update status: Running Setup
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.RUNNING_SETUP,
			undefined,
			providerServerId,
			dokployServer.serverId,
			"Waiting for SSH to be available...",
		);

		// Wait for SSH to be ready (server might still be booting)
		await waitForSSH(
			provisionResult.ipAddress,
			22,
			"root",
			privateKey,
			300000, // 5 minutes timeout
			async (message) => {
				await updateProvisioningJobStatus(
					jobId,
					ProvisioningStatus.RUNNING_SETUP,
					undefined,
					providerServerId,
					dokployServer.serverId,
					message,
				).catch((err) => console.error("Failed to update job message:", err));
			},
		);

		// Update message that we're now installing
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.RUNNING_SETUP,
			undefined,
			providerServerId,
			dokployServer.serverId,
			"Installing Docker and dependencies...",
		);

		// Run server setup (installs Docker, etc.)
		let lastMessage = "";
		await serverSetup(dokployServer.serverId, async (log) => {
			// Update job with setup progress
			const cleanLog = log?.toString().trim();
			if (cleanLog && cleanLog !== lastMessage) {
				lastMessage = cleanLog;
				// Update message in database (throttled to avoid too many updates)
				await updateProvisioningJobStatus(
					jobId,
					ProvisioningStatus.RUNNING_SETUP,
					undefined,
					providerServerId,
					dokployServer.serverId,
					cleanLog,
				).catch((err) => console.error("Failed to update job message:", err));
			}
		});

		// Update status: Completed
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.COMPLETED,
			undefined,
			providerServerId,
			dokployServer.serverId,
		);

		return {
			jobId,
			serverId: dokployServer.serverId,
			providerServerId,
			ipAddress: provisionResult.ipAddress,
		};
	} catch (error) {
		// Cleanup on failure
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.FAILED,
			error instanceof Error ? error.message : "Unknown error",
			providerServerId,
		);

		// Try to cleanup provider resources
		if (providerServerId) {
			try {
				const apiToken = await getDecryptedApiToken(organizationId, provider);
				const providerClient = createCloudProvider(provider, apiToken);
				await providerClient.deleteServer(providerServerId);
			} catch (cleanupError) {
				console.error("Failed to cleanup provider server:", cleanupError);
			}
		}

		// Delete SSH key if created
		if (sshKeyId) {
			try {
				await db.delete(sshKeys).where(eq(sshKeys.sshKeyId, sshKeyId));
			} catch (cleanupError) {
				console.error("Failed to cleanup SSH key:", cleanupError);
			}
		}

		throw error;
	}
};

/**
 * Delete a cloud-provisioned server and its resources
 */
export const deleteCloudServer = async (serverId: string) => {
	const currentServer = await db.query.server.findFirst({
		where: eq(server.serverId, serverId),
	});

	if (!currentServer) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}

	// If this is a cloud-provisioned server, delete from provider
	if (
		currentServer.cloudProvider &&
		currentServer.providerServerId &&
		currentServer.organizationId
	) {
		try {
			const apiToken = await getDecryptedApiToken(
				currentServer.organizationId,
				currentServer.cloudProvider as CloudProvider,
			);
			const providerClient = createCloudProvider(
				currentServer.cloudProvider as CloudProvider,
				apiToken,
			);
			await providerClient.deleteServer(currentServer.providerServerId);
		} catch (error) {
			console.error("Failed to delete server from provider:", error);
			// Continue with local deletion even if provider deletion fails
		}
	}

	// Delete from local database
	const deleted = await db
		.delete(server)
		.where(eq(server.serverId, serverId))
		.returning()
		.then((res) => res[0]);

	return deleted;
};
