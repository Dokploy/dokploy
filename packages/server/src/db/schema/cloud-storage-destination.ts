import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Define cloud storage provider types
export const CloudStorageProviderEnum = z.enum([
	"drive", // Google Drive
	"dropbox", // Dropbox
	"box", // Box
	"ftp", // FTP
	"sftp", // SFTP
]);

export type CloudStorageProvider = z.infer<typeof CloudStorageProviderEnum>;

// All providers use direct credentials
export function isCredentialProvider(provider: string): boolean {
	return ["ftp", "sftp"].includes(provider);
}

export function isOAuthProvider(provider: string): boolean {
	return ["drive", "dropbox", "box"].includes(provider);
}

// Define the cloud storage destination table
export const cloudStorageDestination = pgTable("cloud_storage_destination", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	provider: text("provider").notNull(),
	// Direct credential fields for FTP/SFTP
	username: text("username"), // For FTP/SFTP
	password: text("password"), // For FTP/SFTP
	host: text("host"), // For FTP/SFTP
	port: text("port"), // For FTP/SFTP
	config: text("config"), // For OAuth token (Drive, Dropbox, Box)
	organizationId: text("organization_id").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// Create Zod schemas for validation
export const insertCloudStorageDestinationSchema = createInsertSchema(
	cloudStorageDestination,
);
export const selectCloudStorageDestinationSchema = createSelectSchema(
	cloudStorageDestination,
);

// API schemas
export const apiCreateCloudStorageDestination = z.object({
	name: z.string().min(1, "Name is required"),
	provider: CloudStorageProviderEnum,
	config: z.string(),
});

export const apiUpdateCloudStorageDestination =
	apiCreateCloudStorageDestination.extend({
		destinationId: z.string(),
	});

export const apiFindOneCloudStorageDestination = z.object({
	destinationId: z.string(),
});

export const apiDeleteCloudStorageDestination = z.object({
	destinationId: z.string(),
});

// Form validation schema
export const cloudStorageDestinationSchema = z.object({
	providerType: CloudStorageProviderEnum,
	host: z.string().optional(),
	username: z.string().optional(),
	password: z.string().optional(),
	port: z.string().optional(),
	token: z.string().optional(),
});

export type CloudStorageDestinationFormValues = z.infer<
	typeof cloudStorageDestinationSchema
>;

// Store raw credentials
export function storeCredentials(
	provider: string,
	credentials?: Record<string, any>,
): string {
	// For OAuth, just store the token
	if (provider === "drive") {
		return credentials?.token || "";
	}

	// For other providers, store credentials as is
	return JSON.stringify(credentials || {});
}

// Generate rclone config
export function generateProviderConfig(
	provider: string,
	credentials?: Record<string, any>,
): string {
	switch (provider) {
		case "ftp":
		case "sftp":
			return `[${provider}]
type = ${provider}
host = ${credentials?.host || ""}
user = ${credentials?.username || ""}
pass = ${credentials?.password || ""}
${credentials?.port ? `port = ${credentials?.port}` : ""}`;

		case "drive":
		case "dropbox":
		case "box":
			if (!credentials?.token) {
				throw new Error("OAuth token is required");
			}
			return `[${provider}]
type = ${provider}
${provider === "drive" ? "scope = drive.file\n" : ""}token = ${credentials.token}`;

		default:
			throw new Error(`Unsupported provider: ${provider}`);
	}
}
