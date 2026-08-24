import { db } from "@dokploy/server/db";
import {
	server,
	serverProvisioningJob,
	sshKeys,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import * as ssh2 from "ssh2";
import { nanoid } from "nanoid";
import { createServer as createDokployServer } from "./server";
import { serverSetup } from "@dokploy/server/setup/server-setup";
import {
	CloudProvider,
	ProvisioningStatus,
	type ServerConfig,
} from "@dokploy/server/providers/types";
import { createCloudProvider } from "@dokploy/server/providers/factory";
import {
	getDecryptedProviderCredentials,
	updateProvisioningJobStatus,
} from "./cloud-provider";

const generateSSHKeyPair = (): Promise<{
	publicKey: string;
	privateKey: string;
}> => {
	return new Promise((resolve, reject) => {
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

const waitForSSH = (
	host: string,
	port: number,
	username: string,
	privateKey: string,
	timeout = 300000,
	onProgress?: (message: string) => Promise<void> | void,
): Promise<void> => {
	return new Promise((resolve, reject) => {
		const startTime = Date.now();
		const retryInterval = 5000;

		const attemptConnection = () => {
			if (Date.now() - startTime > timeout) {
				reject(new Error(`SSH connection timeout after ${timeout}ms`));
				return;
			}

			const client = new ssh2.Client();

			client
				.once("ready", () => {
					client.end();
					resolve();
				})
				.once("error", (err) => {
					client.end();
					const elapsed = Math.floor((Date.now() - startTime) / 1000);
					void onProgress?.(`Waiting for SSH (${elapsed}s)... ${err.message}`);
					setTimeout(attemptConnection, retryInterval);
				})
				.connect({
					host,
					port,
					username,
					privateKey,
					readyTimeout: 20000,
				});
		};

		attemptConnection();
	});
};

export const provisionServer = async (
	jobId: string,
	organizationId: string,
	provider: CloudProvider,
	config: ServerConfig,
) => {
	let providerServerId: string | undefined;
	let providerSshKeyId: string | undefined;
	let sshKeyId: string | undefined;

	try {
		const providerCredentials = await getDecryptedProviderCredentials(
			organizationId,
			provider,
		);
		const providerClient = createCloudProvider(provider, providerCredentials);

		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.GENERATING_SSH_KEY,
			undefined,
			undefined,
			undefined,
			"Generating 4096-bit RSA SSH key pair...",
		);

		const { publicKey, privateKey } = await generateSSHKeyPair();

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

		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.UPLOADING_SSH_KEY,
			undefined,
			undefined,
			undefined,
			`Uploading SSH key to ${provider}...`,
		);

		const providerSSHKey = await providerClient.ensureSSHKey(
			`dokploy-${config.name}-${nanoid(6)}`,
			publicKey,
		);
		providerSshKeyId = providerSSHKey.id;

		await db
			.update(serverProvisioningJob)
			.set({ providerSshKeyId })
			.where(eq(serverProvisioningJob.jobId, jobId));

		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.CREATING_SERVER,
			undefined,
			undefined,
			undefined,
			`Creating ${config.serverType} server in ${config.location}...`,
		);

		const serverInstance = await providerClient.createServer({
			...config,
			sshKeyIds: [providerSSHKey.id],
		});

		providerServerId = serverInstance.id;

		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.CREATING_SERVER,
			undefined,
			providerServerId,
		);

		const readyServer = await providerClient.waitForServer(
			serverInstance.id,
			300000,
			(status) => {
				void updateProvisioningJobStatus(
					jobId,
					ProvisioningStatus.CREATING_SERVER,
					undefined,
					providerServerId,
					undefined,
					`Waiting for server to be ready... ${status}`,
				).catch((error) => {
					console.error("Failed to update server wait status:", error);
				});
			},
		);

		const ipAddress = readyServer.ipv4 || serverInstance.ipv4 || "";

		if (!ipAddress) {
			throw new Error("Provider did not return an IPv4 address");
		}

		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.CONFIGURING_DOKPLOY,
			undefined,
			providerServerId,
			undefined,
			`Creating Dokploy server record for ${ipAddress}...`,
		);

		const dokployServer = await createDokployServer(
			{
				name: config.name,
				description: `Provisioned via ${provider}`,
				ipAddress,
				port: 22,
				username: "root",
				sshKeyId,
				serverType: "deploy",
				enableDockerCleanup: true,
			},
			organizationId,
		);

		await db
			.update(server)
			.set({
				cloudProvider: provider,
				providerServerId,
				providerMetadata: {
					provider,
					location: config.location,
					region: config.location,
					serverType: config.serverType,
					instanceType: config.serverType,
					image: config.image,
					imageId: config.image,
					sshKeyIds: [providerSSHKey.id],
				},
			})
			.where(eq(server.serverId, dokployServer.serverId));

		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.RUNNING_SETUP,
			undefined,
			providerServerId,
			dokployServer.serverId,
			"Waiting for SSH to be available...",
		);

		await waitForSSH(
			ipAddress,
			22,
			"root",
			privateKey,
			300000,
			async (message) => {
				await updateProvisioningJobStatus(
					jobId,
					ProvisioningStatus.RUNNING_SETUP,
					undefined,
					providerServerId,
					dokployServer.serverId,
					message,
				).catch((error) => {
					console.error("Failed to update job message:", error);
				});
			},
		);

		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.RUNNING_SETUP,
			undefined,
			providerServerId,
			dokployServer.serverId,
			"Installing Docker and dependencies...",
		);

		let lastMessage = "";
		await serverSetup(dokployServer.serverId, async (log) => {
			const cleanLog = log?.toString().trim();
			if (cleanLog && cleanLog !== lastMessage) {
				lastMessage = cleanLog;
				await updateProvisioningJobStatus(
					jobId,
					ProvisioningStatus.RUNNING_SETUP,
					undefined,
					providerServerId,
					dokployServer.serverId,
					cleanLog,
				).catch((error) => {
					console.error("Failed to update job message:", error);
				});
			}
		});

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
			ipAddress,
		};
	} catch (error) {
		await updateProvisioningJobStatus(
			jobId,
			ProvisioningStatus.FAILED,
			error instanceof Error ? error.message : "Unknown error",
			providerServerId,
		);

		if (providerServerId) {
			try {
				const providerCredentials = await getDecryptedProviderCredentials(
					organizationId,
					provider,
				);
				const providerClient = createCloudProvider(
					provider,
					providerCredentials,
				);
				await providerClient.deleteServer(providerServerId);
			} catch (cleanupError) {
				console.error("Failed to cleanup provider server:", cleanupError);
			}
		}

		if (providerSshKeyId) {
			try {
				const providerCredentials = await getDecryptedProviderCredentials(
					organizationId,
					provider,
				);
				const providerClient = createCloudProvider(
					provider,
					providerCredentials,
				);
				await providerClient.deleteSSHKey(providerSshKeyId);
			} catch (cleanupError) {
				console.error("Failed to cleanup provider SSH key:", cleanupError);
			}
		}

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

	if (
		currentServer.cloudProvider &&
		currentServer.providerServerId &&
		currentServer.organizationId
		) {
			try {
				const providerCredentials = await getDecryptedProviderCredentials(
					currentServer.organizationId,
					currentServer.cloudProvider as CloudProvider,
				);
				const providerClient = createCloudProvider(
					currentServer.cloudProvider as CloudProvider,
					providerCredentials,
				);
				await providerClient.deleteServer(currentServer.providerServerId);
			} catch (error) {
			console.error("Failed to delete server from provider:", error);
		}
	}

	const deleted = await db
		.delete(server)
		.where(eq(server.serverId, serverId))
		.returning()
		.then((res) => res[0]);

	return deleted;
};
