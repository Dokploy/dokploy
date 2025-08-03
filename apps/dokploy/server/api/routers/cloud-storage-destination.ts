import { spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { cloudStorageBackup } from "@dokploy/server/db/schema/cloud-storage-backup";
import {
	cloudStorageDestination,
	generateProviderConfig,
	storeCredentials,
} from "@dokploy/server/db/schema/cloud-storage-destination";
import {
	CloudStorageProviderEnum,
	apiCreateCloudStorageDestination,
	apiDeleteCloudStorageDestination,
	apiUpdateCloudStorageDestination,
} from "@dokploy/server/db/schema/cloud-storage-destination";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

// Function to kill any existing rclone processes
async function killExistingRcloneProcesses() {
	try {
		const { stdout } = await execAsync("pgrep -f rclone");
		const pids = stdout.trim().split("\n").filter(Boolean);

		for (const pid of pids) {
			try {
				await execAsync(`kill -9 ${pid}`);
			} catch (error) {
				console.error(`Failed to kill process ${pid}:`, error);
			}
		}
	} catch (_error) {
		console.log("No existing rclone processes found");
	}
}

// Function to create rclone config path
function getRcloneConfigPath(
	organizationId: string,
	destinationId: string,
): string {
	const configDir = join(
		os.homedir(),
		".dokploy",
		"rclone",
		"cloud",
		organizationId,
	);

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	return join(configDir, `${destinationId}.conf`);
}

// Helper function to run rclone authorize command
async function runRcloneAuthorize(providerType: string): Promise<string> {
	try {
		const tempConfigPath = join(os.tmpdir(), `rclone-auth-${Date.now()}.conf`);
		const configContent = `[${providerType}]
no_browser = true`;
		writeFileSync(tempConfigPath, configContent);

		try {
			const { stdout } = await execAsync(
				`rclone --config ${tempConfigPath} authorize "${providerType}"`,
			);
			console.log("Rclone output:", stdout);

			const tokenMatch = stdout.match(/\{[\s\S]*?\}/);
			if (tokenMatch) {
				return tokenMatch[0];
			}
			throw new Error("Could not find token in rclone output");
		} finally {
			if (existsSync(tempConfigPath)) {
				unlinkSync(tempConfigPath);
			}
		}
	} catch (error) {
		console.error("Failed to run rclone authorize:", error);
		throw error;
	}
}

// Add this helper function near the top of the file
export async function testCloudStorageConnection({
	provider,
	credentials,
}: { provider: string; credentials: any; destinationId?: string; ctx?: any }) {
	if (["drive", "dropbox", "box"].includes(provider)) {
		if (!credentials.token) {
			const providerType =
				provider === "drive"
					? "drive"
					: provider === "dropbox"
						? "dropbox"
						: "box";
			try {
				console.log("Starting OAuth flow for provider:", providerType);
				await killExistingRcloneProcesses();
				let lastError: Error | undefined;
				for (let attempt = 0; attempt < 3; attempt++) {
					try {
						const token = await runRcloneAuthorize(providerType);
						console.log("Got token from OAuth flow");
						try {
							const parsedToken = JSON.parse(token);
							if (!parsedToken.access_token) {
								throw new Error("Invalid token format: missing access_token");
							}
							credentials.token = token;
							console.log("Token validated successfully");
							break;
						} catch (parseError) {
							console.error("Token parse error:", parseError);
							console.error("Token string:", token);
							throw new Error(
								"Failed to parse the OAuth token. Please try authenticating again.",
							);
						}
					} catch (error: unknown) {
						lastError =
							error instanceof Error ? error : new Error(String(error));
						console.error(`Attempt ${attempt + 1} failed:`, error);
						if (
							error instanceof Error &&
							error.message.includes("address already in use")
						) {
							await killExistingRcloneProcesses();
							await new Promise((resolve) => setTimeout(resolve, 1000));
							continue;
						}
						throw error;
					}
				}
				if (lastError) {
					throw lastError;
				}
			} catch (authError) {
				console.error("Authentication error:", authError);
				throw new Error(
					authError instanceof Error
						? authError.message
						: "Authentication failed",
				);
			}
		}
	}
	// Create temporary config file
	const configPath = join(os.tmpdir(), `test-${Date.now()}.conf`);
	try {
		const configContent = generateProviderConfig(provider, credentials);
		writeFileSync(configPath, configContent);
		await execAsync(`rclone lsd --config=${configPath} "${provider}:"`);
		return {
			success: true,
			token: ["drive", "dropbox", "box"].includes(provider)
				? credentials.token
				: undefined,
		};
	} finally {
		if (existsSync(configPath)) {
			unlinkSync(configPath);
		}
	}
}

export const cloudStorageDestinationRouter = createTRPCRouter({
	all: protectedProcedure.query(async ({ ctx }) => {
		try {
			const destinations = await db
				.select()
				.from(cloudStorageDestination)
				.where(
					eq(
						cloudStorageDestination.organizationId,
						ctx.session.activeOrganizationId,
					),
				)
				.orderBy(desc(cloudStorageDestination.createdAt));

			return destinations;
		} catch (error) {
			console.error("Error fetching destinations:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Error fetching cloud storage destinations",
			});
		}
	}),

	create: protectedProcedure
		.input(apiCreateCloudStorageDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const { provider, name, config } = input;

				const credentials = JSON.parse(config);

				const storedConfig = storeCredentials(provider, credentials);

				const [newDestination] = await db
					.insert(cloudStorageDestination)
					.values({
						name,
						provider,
						organizationId: ctx.session.activeOrganizationId,
						config: storedConfig,
					})
					.returning();

				if (!newDestination) {
					throw new Error("Failed to create cloud storage destination");
				}

				const configPath = getRcloneConfigPath(
					ctx.session.activeOrganizationId,
					newDestination.id,
				);

				const configContent = generateProviderConfig(provider, credentials);
				writeFileSync(configPath, configContent);

				return newDestination;
			} catch (error) {
				console.error("Create error:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error creating destination",
				});
			}
		}),

	update: protectedProcedure
		.input(apiUpdateCloudStorageDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const { destinationId, provider, name, config } = input;

				let credentials: any = {};
				try {
					credentials = JSON.parse(config);
				} catch { }

				const [updatedDestination] = await db
					.update(cloudStorageDestination)
					.set({
						name,
						provider,
						config,
						host: credentials.host || null,
						port: credentials.port || null,
						username: credentials.username || null,
						password: credentials.password || null,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(cloudStorageDestination.id, destinationId),
							eq(
								cloudStorageDestination.organizationId,
								ctx.session.activeOrganizationId,
							),
						),
					)
					.returning();

				if (!updatedDestination) {
					throw new Error("Cloud storage destination not found");
				}

				const configPath = getRcloneConfigPath(
					ctx.session.activeOrganizationId,
					updatedDestination.id,
				);

				const configContent = generateProviderConfig(
					updatedDestination.provider,
					credentials,
				);
				writeFileSync(configPath, configContent);

				return updatedDestination;
			} catch (error) {
				console.error("Update error:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error updating destination",
				});
			}
		}),

	// Delete a cloud storage destination
	delete: protectedProcedure
		.input(apiDeleteCloudStorageDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const associatedBackups = await db
					.select()
					.from(cloudStorageBackup)
					.where(
						and(
							eq(
								cloudStorageBackup.cloudStorageDestinationId,
								input.destinationId,
							),
							eq(
								cloudStorageBackup.organizationId,
								ctx.session.activeOrganizationId,
							),
						),
					);

				if (associatedBackups.length > 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Cannot delete destination with associated backups. Please delete the backups first.",
					});
				}

				const deletedDestination = await db
					.delete(cloudStorageDestination)
					.where(
						and(
							eq(cloudStorageDestination.id, input.destinationId),
							eq(
								cloudStorageDestination.organizationId,
								ctx.session.activeOrganizationId,
							),
						),
					)
					.returning();

				if (!deletedDestination.length) {
					throw new Error("Cloud storage destination not found");
				}

				const configPath = getRcloneConfigPath(
					ctx.session.activeOrganizationId,
					input.destinationId,
				);

				if (existsSync(configPath)) {
					unlinkSync(configPath);
				}

				return deletedDestination[0];
			} catch (error) {
				console.error("Delete error:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error deleting destination",
				});
			}
		}),

	getStorageMetrics: protectedProcedure
		.input(z.object({ destinationId: z.string() }))
		.query(async ({ input, ctx }) => {
			try {
				const destinations = await db
					.select()
					.from(cloudStorageDestination)
					.where(
						and(
							eq(cloudStorageDestination.id, input.destinationId),
							eq(
								cloudStorageDestination.organizationId,
								ctx.session.activeOrganizationId,
							),
						),
					)
					.limit(1);

				const destination = destinations[0];
				if (!destination) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Cloud storage destination not found",
					});
				}

				const configPath = getRcloneConfigPath(
					ctx.session.activeOrganizationId,
					input.destinationId,
				);

				const result = await execAsync(
					`rclone about --config=${configPath} "${destination.provider}:" --json`,
				);

				return JSON.parse(result.stdout);
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get storage metrics",
					cause: error,
				});
			}
		}),

	authorizeOAuth: protectedProcedure
		.input(
			z.object({
				provider: CloudStorageProviderEnum,
			}),
		)
		.mutation(async ({ input }) => {
			try {
				if (input.provider !== "drive") {
					throw new Error(
						"OAuth authorization is only supported for Google Drive",
					);
				}

				const result = await execAsync('rclone authorize "drive" | cat');

				const tokenMatch = result.stdout.match(/\{.*\}/);
				if (!tokenMatch) {
					throw new Error("Failed to extract OAuth token from rclone output");
				}

				const token = tokenMatch[0];

				try {
					const parsedToken = JSON.parse(token);
					if (!parsedToken.access_token || !parsedToken.refresh_token) {
						throw new Error("Invalid token format");
					}
				} catch {
					throw new Error("Invalid token JSON");
				}

				return { token };
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to authorize with provider",
				});
			}
		}),

	testConnection: protectedProcedure
		.input(
			z.object({
				provider: CloudStorageProviderEnum,
				credentials: z.record(z.any()),
				destinationId: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				return await testCloudStorageConnection({
					provider: input.provider,
					credentials: input.credentials,
				});
			} catch (error) {
				console.error("Test connection error:", error);
				const errorMessage =
					error instanceof Error ? error.message : "Connection test failed";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: errorMessage,
				});
			}
		}),

	getTransferStatus: protectedProcedure
		.input(z.object({ destinationId: z.string() }))
		.subscription(async ({ input, ctx }) => {
			const destinations = await db
				.select()
				.from(cloudStorageDestination)
				.where(
					and(
						eq(cloudStorageDestination.id, input.destinationId),
						eq(
							cloudStorageDestination.organizationId,
							ctx.session.activeOrganizationId,
						),
					),
				)
				.limit(1);

			const destination = destinations[0];
			if (!destination) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud storage destination not found",
				});
			}

			const configPath = getRcloneConfigPath(
				ctx.session.activeOrganizationId,
				input.destinationId,
			);

			return observable<string>((emit) => {
				const process = spawn("rclone", [
					"rc",
					"core/stats",
					`--config=${configPath}`,
				]);

				process.stdout.on("data", (data: Buffer) => {
					emit.next(data.toString());
				});

				process.stderr.on("data", (data: Buffer) => {
					console.error(`rclone error: ${data.toString()}`);
				});

				process.on("error", (error) => {
					console.error("Failed to start rclone process:", error);
					emit.error(error);
				});

				return () => {
					process.kill();
				};
			});
		}),

	reconnect: protectedProcedure
		.input(z.object({ destinationId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const destination = await db
				.select()
				.from(cloudStorageDestination)
				.where(
					and(
						eq(cloudStorageDestination.id, input.destinationId),
						eq(
							cloudStorageDestination.organizationId,
							ctx.session.activeOrganizationId,
						),
					),
				);
			const dest = destination[0];
			if (!dest) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Destination not found",
				});
			}

			let credentials: any = {};
			try {
				credentials = dest.config ? JSON.parse(dest.config) : {};
			} catch { }
			const provider = dest.provider;
			if (["drive", "dropbox", "box"].includes(provider)) {
				const configPath = getRcloneConfigPath(
					ctx.session.activeOrganizationId,
					dest.id,
				);

				// If there is a token, try silent refresh first
				if (credentials.token) {
					try {
						const configContent = generateProviderConfig(provider, credentials);
						writeFileSync(configPath, configContent);
						await execAsync(`rclone lsd --config=${configPath} "${provider}:"`);
						return { success: true, silent: true };
					} catch (err: any) {
						if (
							err.stderr &&
							(err.stderr.includes("token expired") ||
								err.stderr.includes("invalid_grant") ||
								err.stderr.includes("unauthorized") ||
								err.stderr.includes("401") ||
								err.stderr.includes("403"))
						) {
							console.log("Token expired or invalid, starting OAuth flow");
							credentials.token = undefined;
						} else {
							console.error("Reconnect error:", err);
							throw new TRPCError({
								code: "BAD_REQUEST",
								message: err.message || "Reconnect failed",
							});
						}
					}
				}

				// If there is no token, start the OAuth flow
				console.log("Starting full OAuth flow");
				const result = await testCloudStorageConnection({
					provider,
					credentials,
				});

				if (result.token) {
					credentials.token = result.token;
					await db
						.update(cloudStorageDestination)
						.set({ config: JSON.stringify(credentials), updatedAt: new Date() })
						.where(
							and(
								eq(cloudStorageDestination.id, input.destinationId),
								eq(
									cloudStorageDestination.organizationId,
									ctx.session.activeOrganizationId,
								),
							),
						);
					const configContent = generateProviderConfig(provider, credentials);
					writeFileSync(configPath, configContent);
					return { success: true, silent: false };
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Failed to get new token",
				});
			}
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Reconnect is only supported for OAuth providers.",
			});
		}),
});
