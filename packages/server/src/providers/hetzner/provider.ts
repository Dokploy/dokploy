import {
	CloudProvider,
	type ICloudProvider,
	type Image,
	type Location,
	type ProvisioningResult,
	ProvisioningStatus,
	type ServerConfig,
	type ServerInstance,
	type ServerType,
	type SSHKey,
} from "../types";
import { HetznerClient } from "./client";

/**
 * Hetzner Cloud Provider implementation
 */
export class HetznerProvider implements ICloudProvider {
	readonly name = CloudProvider.HETZNER;
	private client: HetznerClient;

	constructor(apiToken: string) {
		this.client = new HetznerClient(apiToken);
	}

	async validateCredentials(): Promise<boolean> {
		try {
			return await this.client.validateToken();
		} catch (error) {
			return false;
		}
	}

	async validateToken(): Promise<boolean> {
		return this.validateCredentials();
	}

	async listLocations(): Promise<Location[]> {
		const response = await this.client.getLocations();
		return response.locations.map((loc) => ({
			id: loc.name,
			name: loc.name,
			description: loc.description,
			country: loc.country,
			city: loc.city,
			available: true,
		}));
	}

	async listServerTypes(): Promise<ServerType[]> {
		const response = await this.client.getServerTypes();
		return response.server_types
			.filter((type) => !type.deprecated)
			.map((type) => {
				// Get the first price as reference
				const firstPrice = type.prices[0];
				const priceMonthly = firstPrice
					? Number.parseFloat(firstPrice.price_monthly.gross)
					: 0;
				const priceHourly = firstPrice
					? Number.parseFloat(firstPrice.price_hourly.gross)
					: 0;
				return {
					id: type.name,
					name: type.name,
					description: type.description,
					cores: type.cores,
					memory: type.memory,
					disk: type.disk,
					priceMonthly,
					priceHourly,
					available: true,
				};
			});
	}

	async listImages(): Promise<Image[]> {
		const response = await this.client.getImages({
			type: "system",
			architecture: "x86",
		});

		return response.images
			.filter((img) => img.status === "available" && !img.deprecated)
			.map((img) => ({
				id: img.name || img.id.toString(),
				name: img.name || img.description,
				description: img.description,
				type: img.type,
				osType: img.os_flavor,
				osVersion: img.os_version || undefined,
			}));
	}

	async ensureSSHKey(name: string, publicKey: string): Promise<SSHKey> {
		// Check if SSH key already exists
		const existingKeys = await this.client.getSSHKeys();
		const existing = existingKeys.ssh_keys.find(
			(key) => key.public_key === publicKey,
		);

		if (existing) {
			return {
				id: existing.id.toString(),
				name: existing.name,
				publicKey: existing.public_key,
				fingerprint: existing.fingerprint,
			};
		}

		// Create new SSH key
		return this.createSSHKey(name, publicKey);
	}

	async createSSHKey(name: string, publicKey: string): Promise<SSHKey> {
		const response = await this.client.createSSHKey(name, publicKey);

		return {
			id: response.ssh_key.id.toString(),
			name: response.ssh_key.name,
			publicKey: response.ssh_key.public_key,
			fingerprint: response.ssh_key.fingerprint,
		};
	}

	async deleteSSHKey(id: string): Promise<void> {
		await this.client.deleteSSHKey(Number.parseInt(id, 10));
	}

	async createServer(config: ServerConfig): Promise<ServerInstance> {
		const sshKeyIds = config.sshKeyIds?.map((id) => Number.parseInt(id, 10));

		const response = await this.client.createServer({
			name: config.name,
			server_type: config.serverType,
			location: config.location,
			image: config.image,
			ssh_keys: sshKeyIds,
			start_after_create: config.startAfterCreate ?? true,
			labels: {
				created_by: "dokploy",
			},
		});

		const server = response.server;
		return {
			id: server.id.toString(),
			name: server.name,
			status: server.status,
			ipv4: server.public_net.ipv4?.ip,
			ipv6: server.public_net.ipv6?.ip,
			created: new Date(server.created),
		};
	}

	async getServer(id: string): Promise<ServerInstance> {
		const response = await this.client.getServer(Number.parseInt(id, 10));
		const server = response.server;

		return {
			id: server.id.toString(),
			name: server.name,
			status: server.status,
			ipv4: server.public_net.ipv4?.ip,
			ipv6: server.public_net.ipv6?.ip,
			created: new Date(server.created),
		};
	}

	async waitForServer(
		id: string,
		timeout = 300000, // 5 minutes
		onProgress?: (status: string) => void,
	): Promise<ServerInstance> {
		const startTime = Date.now();
		const pollInterval = 5000; // 5 seconds

		while (Date.now() - startTime < timeout) {
			const server = await this.getServer(id);

			if (onProgress) {
				onProgress(server.status);
			}

			if (server.status === "running") {
				return server;
			}

			if (server.status === "error" || server.status === "unknown") {
				throw new Error(`Server entered error state: ${server.status}`);
			}

			// Wait before next poll
			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}

		throw new Error(`Server failed to start within ${timeout}ms`);
	}

	async deleteServer(id: string): Promise<void> {
		await this.client.deleteServer(Number.parseInt(id, 10));
	}

	async provisionServer(
		config: ServerConfig,
		sshKeyIds?: string[],
		onProgress?: (status: ProvisioningStatus, message?: string) => void,
	): Promise<ProvisioningResult> {
		if (onProgress) {
			onProgress(ProvisioningStatus.CREATING_SERVER, "Creating server...");
		}

		// Add SSH keys to config if provided
		const serverConfig = {
			...config,
			sshKeyIds: sshKeyIds || config.sshKeyIds,
		};

		const serverInstance = await this.createServer(serverConfig);

		if (onProgress) {
			onProgress(
				ProvisioningStatus.CREATING_SERVER,
				"Waiting for server to be ready...",
			);
		}

		const readyServer = await this.waitForServer(
			serverInstance.id,
			300000,
			(status) => {
				if (onProgress) {
					onProgress(
						ProvisioningStatus.CREATING_SERVER,
						`Server status: ${status}`,
					);
				}
			},
		);

		return {
			id: readyServer.id,
			ipAddress: readyServer.ipv4 || "",
			ipv6: readyServer.ipv6,
			status: ProvisioningStatus.COMPLETED,
		};
	}
}
