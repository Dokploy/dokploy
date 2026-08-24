import type { z } from "zod";

/**
 * Supported cloud providers.
 *
 * This is a const-backed value object plus a string-literal union so the same
 * ids can be used in the database, API validation, and UI without the extra
 * nominal friction of a TypeScript enum.
 */
export const CloudProvider = {
	HETZNER: "hetzner",
	AWS: "aws",
	DIGITALOCEAN: "digitalocean",
	// Future providers:
	// VULTR: "vultr",
	// LINODE: "linode",
} as const;

export type CloudProvider =
	(typeof CloudProvider)[keyof typeof CloudProvider];

/**
 * Server provisioning status
 */
export enum ProvisioningStatus {
	PENDING = "pending",
	GENERATING_SSH_KEY = "generating_ssh_key",
	UPLOADING_SSH_KEY = "uploading_ssh_key",
	CREATING_SERVER = "creating_server",
	CONFIGURING_DOKPLOY = "configuring_dokploy",
	RUNNING_SETUP = "running_setup",
	COMPLETED = "completed",
	FAILED = "failed",
}

/**
 * Base interface for server configuration
 */
export interface ServerConfig {
	name: string;
	location: string;
	serverType: string;
	image: string;
	sshKeyIds?: string[];
	startAfterCreate?: boolean;
}

/**
 * Base interface for location information
 */
export interface Location {
	id: string;
	name: string;
	description: string;
	country: string;
	city: string;
	available: boolean;
}

/**
 * Base interface for server type/size information
 */
export interface ServerType {
	id: string;
	name: string;
	description: string;
	cores: number;
	memory: number; // in GB
	disk: number; // in GB
	priceMonthly: number;
	priceHourly: number;
	available: boolean;
}

/**
 * Base interface for OS image information
 */
export interface Image {
	id: string;
	name: string;
	description: string;
	type: string;
	osType: string;
	osVersion?: string;
}

/**
 * Server instance information
 */
export interface ServerInstance {
	id: string;
	name: string;
	status: string;
	ipv4?: string;
	ipv6?: string;
	created: Date;
}

/**
 * SSH Key information
 */
export interface SSHKey {
	id: string;
	name: string;
	publicKey: string;
	fingerprint: string;
}

/**
 * Base interface that all cloud providers must implement
 */
export interface ICloudProvider {
	/**
	 * Provider name
	 */
	readonly name: CloudProvider;

	/**
	 * Validate API credentials
	 */
	validateCredentials(): Promise<boolean>;

	/**
	 * Alias for validateCredentials
	 */
	validateToken(): Promise<boolean>;

	/**
	 * List available locations/regions
	 */
	listLocations(): Promise<Location[]>;

	/**
	 * List available server types/sizes
	 */
	listServerTypes(): Promise<ServerType[]>;

	/**
	 * List available OS images
	 */
	listImages(): Promise<Image[]>;

	/**
	 * Create or get an SSH key
	 */
	ensureSSHKey(name: string, publicKey: string): Promise<SSHKey>;

	/**
	 * Create an SSH key (alias for convenience)
	 */
	createSSHKey(name: string, publicKey: string): Promise<SSHKey>;

	/**
	 * Delete an SSH key
	 */
	deleteSSHKey(id: string): Promise<void>;

	/**
	 * Create a new server
	 */
	createServer(config: ServerConfig): Promise<ServerInstance>;

	/**
	 * Get server details
	 */
	getServer(id: string): Promise<ServerInstance>;

	/**
	 * Wait for server to be ready
	 */
	waitForServer(
		id: string,
		timeout?: number,
		onProgress?: (status: string) => void,
	): Promise<ServerInstance>;

	/**
	 * Delete a server
	 */
	deleteServer(id: string): Promise<void>;
}

/**
 * Provider credentials storage
 */
export interface ProviderCredentials {
	provider: CloudProvider;
	apiToken: string;
	// Additional provider-specific fields can be added
	additionalConfig?: Record<string, unknown>;
}

/**
 * Provider factory interface
 */
export interface IProviderFactory {
	createProvider(
		provider: CloudProvider,
		credentials: ProviderCredentials,
	): ICloudProvider;
	getSupportedProviders(): CloudProvider[];
}
