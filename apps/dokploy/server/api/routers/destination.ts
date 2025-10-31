import {
	createDestintation,
	execAsync,
	execAsyncRemote,
	findDestinationById,
	IS_CLOUD,
	removeDestinationById,
	updateDestinationById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import CryptoJS from "crypto-js";
import { desc, eq } from "drizzle-orm";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateDestination,
	apiFindOneDestination,
	apiRemoveDestination,
	apiUpdateDestination,
	destinations,
} from "@/server/db/schema";

// Encryption utilities for server-side use
const getEncryptionKey = (): string => {
	return (
		process.env.DOKPLOY_ENCRYPTION_KEY ||
		"dokploy-s3-backup-encryption-key-2024"
	);
};

const encryptValue = (text: string): string => {
	if (!text) return text;
	try {
		return CryptoJS.AES.encrypt(text, getEncryptionKey()).toString();
	} catch (error) {
		console.error("Encryption error:", error);
		return text;
	}
};

const decryptValue = (encryptedText: string): string => {
	if (!encryptedText) return encryptedText;

	// Check if the value is encrypted (CryptoJS encrypted strings ALWAYS start with "U2FsdGVkX1")
	// This is "Salted__" in base64, which CryptoJS uses as a prefix
	const isEncrypted = encryptedText.startsWith("U2FsdGVkX1");

	// If it's not encrypted, return as-is (already plain text)
	if (!isEncrypted) {
		return encryptedText;
	}

	// Try to decrypt the encrypted value
	try {
		const decrypted = CryptoJS.AES.decrypt(encryptedText, getEncryptionKey());
		const plainText = decrypted.toString(CryptoJS.enc.Utf8);

		// Check if decryption was successful
		// CryptoJS will return an empty string if decryption fails (wrong key or corrupted)
		// We need both sigBytes > 0 (got some data) AND plainText.length > 0 (valid UTF-8 result)
		if (decrypted.sigBytes > 0 && plainText.length > 0) {
			// Decryption successful - return plain text
			return plainText;
		}

		// Decryption failed - the value was encrypted but couldn't be decrypted
		// This might indicate wrong key or corrupted data
		console.warn(
			"Decryption failed for encrypted value. sigBytes:",
			decrypted.sigBytes,
			"plainText length:",
			plainText.length,
		);

		// Return original encrypted value - this will be caught by validation in testConnection
		// and will prevent using encrypted values as credentials
		return encryptedText;
	} catch (error) {
		console.error("Decryption error:", error);
		// If decryption fails due to exception, return original
		// This will be caught by validation in testConnection
		return encryptedText;
	}
};

export const destinationRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				// Decrypt values if they are encrypted before storing as plain text in DB
				const decryptedInput = {
					...input,
					accessKey: decryptValue(input.accessKey),
					secretAccessKey: decryptValue(input.secretAccessKey),
				};
				return await createDestintation(
					decryptedInput,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the destination",
					cause: error,
				});
			}
		}),
	testConnection: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			// ALWAYS decrypt values before using for connection test
			// This ensures we use plain text credentials regardless of whether they come encrypted or not
			const accessKey = decryptValue(input.accessKey);
			const secretAccessKey = decryptValue(input.secretAccessKey);
			const { bucket, region, endpoint, provider } = input;

			// Validate that decryption was successful - only check for CryptoJS prefix
			// CryptoJS encrypted strings ALWAYS start with "U2FsdGVkX1" (Salted__ in base64)
			// If decryption failed, the value will still have this prefix
			const isAccessKeyStillEncrypted = accessKey?.startsWith("U2FsdGVkX1");
			const isSecretKeyStillEncrypted = secretAccessKey?.startsWith("U2FsdGVkX1");

			if (isAccessKeyStillEncrypted || isSecretKeyStillEncrypted) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Failed to decrypt credentials. The encryption key might be incorrect or the data might be corrupted. Please re-enter your credentials.",
				});
			}

			if (!accessKey || !secretAccessKey || !bucket || !endpoint) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Missing required fields for connection test",
				});
			}

			// Ensure we're using plain text (not encrypted) values
			// At this point, accessKey and secretAccessKey should be plain text
			// If they still look encrypted (have the prefix), decryption failed

			try {
				const rcloneFlags = [
					`--s3-access-key-id=${accessKey}`,
					`--s3-secret-access-key=${secretAccessKey}`,
					`--s3-region=${region}`,
					`--s3-endpoint=${endpoint}`,
					"--s3-no-check-bucket",
					"--s3-force-path-style",
				];
				if (provider) {
					rcloneFlags.unshift(`--s3-provider=${provider}`);
				}
				const rcloneDestination = `:s3:${bucket}`;
				const rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Server not found",
					});
				}

				if (IS_CLOUD) {
					await execAsyncRemote(input.serverId || "", rcloneCommand);
				} else {
					await execAsync(rcloneCommand);
				}
			} catch (error) {
				// Extract meaningful error message
				let errorMessage = "Error connecting to bucket";
				if (error instanceof Error) {
					errorMessage = error.message;

					// Try to extract stderr from error if available
					const errorWithStderr = error as Error & {
						stderr?: string;
						stdout?: string;
					};
					if (errorWithStderr.stderr) {
						errorMessage = errorWithStderr.stderr.trim();
					}

					// Check for common rclone/S3 errors in the message
					const errorText = errorMessage.toLowerCase();
					if (
						errorText.includes("accessdenied") ||
						errorText.includes("invalidaccesskeyid") ||
						errorText.includes("signaturedoesnotmatch")
					) {
						errorMessage =
							"Invalid access key or secret key. Please check your credentials.";
					} else if (
						errorText.includes("nosuchbucket") ||
						errorText.includes("bucket does not exist")
					) {
						errorMessage =
							"Bucket does not exist or is not accessible. Please check your bucket name.";
					} else if (
						errorText.includes("exited with code") ||
						errorText.includes("command failed")
					) {
						errorMessage =
							"Failed to connect to S3 bucket. Please verify your credentials, bucket name, endpoint, and region.";
					} else if (
						errorText.includes("connection") ||
						errorText.includes("network")
					) {
						errorMessage =
							"Network error. Please check your endpoint URL and network connectivity.";
					}

					// Clean up the error message (remove command details if present)
					const splitResult = errorMessage.split("command:")[0];
					errorMessage =
						splitResult?.trim() || errorMessage || "Error connecting to bucket";
				}

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: errorMessage,
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneDestination)
		.query(async ({ input, ctx }) => {
			const destination = await findDestinationById(input.destinationId);
			if (destination.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this destination",
				});
			}
			// Encrypt sensitive fields before returning to UI for display
			return {
				...destination,
				accessKey: encryptValue(destination.accessKey),
				secretAccessKey: encryptValue(destination.secretAccessKey),
			};
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.destinations.findMany({
			where: eq(
				destinations.organizationId,
				ctx.session.activeOrganizationId || "",
			),
			orderBy: [desc(destinations.createdAt)],
		});
	}),
	remove: adminProcedure
		.input(apiRemoveDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destination = await findDestinationById(input.destinationId);

				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this destination",
					});
				}
				return await removeDestinationById(
					input.destinationId,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw error;
			}
		}),
	update: adminProcedure
		.input(apiUpdateDestination)
		.mutation(async ({ input, ctx }) => {
			try {
				const destination = await findDestinationById(input.destinationId);
				if (destination.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to update this destination",
					});
				}
				// Decrypt values if they are encrypted before storing as plain text in DB
				const decryptedInput = {
					...input,
					accessKey: decryptValue(input.accessKey),
					secretAccessKey: decryptValue(input.secretAccessKey),
					organizationId: ctx.session.activeOrganizationId,
				};
				return await updateDestinationById(input.destinationId, decryptedInput);
			} catch (error) {
				throw error;
			}
		}),
});
