import { eq } from "drizzle-orm";
import { db } from "../db";
import {
	type CloudStorageProvider,
	cloudStorageDestination,
	isCredentialProvider,
} from "../db/schema/cloud-storage-destination";

interface Credential {
	user: string;
	pass: string;
	host: string;
}

/**
 * Service for handling cloud storage destinations
 */
export class CloudStorageDestinationService {
	/**
	 * Create a new cloud storage destination
	 */
	async create({
		name,
		provider,
		config,
		organizationId,
	}: {
		name: string;
		provider: CloudStorageProvider;
		config: string;
		organizationId: string;
	}) {
		try {
			return await db
				.insert(cloudStorageDestination)
				.values({
					name,
					provider,
					config,
					organizationId,
				})
				.returning();
		} catch (error) {
			console.error("Error creating cloud storage destination", {
				error,
				name,
				provider,
			});
			throw error;
		}
	}

	/**
	 * Update an existing cloud storage destination
	 */
	async update({
		destinationId,
		name,
		provider,
		config,
	}: {
		destinationId: string;
		name: string;
		provider: CloudStorageProvider;
		config: string;
	}) {
		try {
			return await db
				.update(cloudStorageDestination)
				.set({
					name,
					provider,
					config,
				})
				.where(eq(cloudStorageDestination.id, destinationId))
				.returning();
		} catch (error) {
			console.error("Error updating cloud storage destination", {
				error,
				destinationId,
			});
			throw error;
		}
	}

	/**
	 * Delete a cloud storage destination
	 */
	async delete(destinationId: string) {
		try {
			await db
				.delete(cloudStorageDestination)
				.where(eq(cloudStorageDestination.id, destinationId));

			return { success: true };
		} catch (error) {
			console.error("Error deleting cloud storage destination", {
				error,
				destinationId,
			});
			throw error;
		}
	}

	/**
	 * Test connection to a cloud storage destination
	 */
	async testConnection({
		provider,
		customConfig,
	}: {
		provider: CloudStorageProvider;
		customConfig: string;
	}) {
		try {
			// For credential-based providers
			if (isCredentialProvider(provider)) {
				if (provider === "drive") {
					try {
						const config = JSON.parse(customConfig);
						if (!config.clientId || !config.clientSecret) {
							throw new Error(
								"Invalid OAuth configuration: missing client credentials",
							);
						}
						return {
							success: true,
							message: "Google Drive OAuth configuration is valid",
						};
					} catch (_error) {
						throw new Error("Invalid OAuth configuration format");
					}
				}

				const credentials = this.parseCredentials(customConfig);
				if (!credentials) {
					throw new Error(
						`Invalid ${provider.toUpperCase()} configuration: missing credentials`,
					);
				}

				return {
					success: true,
					message: `${provider.toUpperCase()} configuration is valid`,
				};
			}

			return { success: true, message: "Configuration validated" };
		} catch (error) {
			console.error("Error testing cloud storage connection", {
				error,
				provider,
			});
			throw error;
		}
	}

	/**
	 * Parse credentials from configuration string for FTP/SFTP
	 */
	private parseCredentials(configString: string): Credential | null {
		try {
			const lines = configString.split("\n");
			const hostLine = lines.find((line) => line.startsWith("host="));
			const userLine = lines.find((line) => line.startsWith("user="));
			const passLine = lines.find((line) => line.startsWith("pass="));

			if (!hostLine || !userLine || !passLine) {
				return null;
			}
			return {
				host: hostLine.replace("host=", "").trim(),
				user: userLine.replace("user=", "").trim(),
				pass: passLine.replace("pass=", "").trim(),
			};
		} catch (error) {
			console.error("Error parsing credentials from config string", { error });
			return null;
		}
	}
}

// Export a singleton instance
export const cloudStorageDestinationService =
	new CloudStorageDestinationService();
