import { relations } from "drizzle-orm";
import { jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";

export const cloudProviderEnum = pgEnum("cloudProvider", [
	"hetzner",
	// Future providers can be added here
	// "digitalocean",
	// "vultr",
	// "aws",
	// "linode",
]);

export const provisioningStatusEnum = pgEnum("provisioningStatus", [
	"pending",
	"generating_ssh_key",
	"uploading_ssh_key",
	"creating_server",
	"configuring_dokploy",
	"running_setup",
	"completed",
	"failed",
]);

/**
 * Cloud provider credentials
 * Stores encrypted API tokens and configuration for cloud providers
 */
export const cloudProviderCredentials = pgTable("cloud_provider_credentials", {
	credentialId: text("credentialId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	provider: cloudProviderEnum("provider").notNull(),
	name: text("name").notNull(),
	description: text("description"),
	// Encrypted API token/credentials
	encryptedApiToken: text("encryptedApiToken").notNull(),
	// Additional provider-specific configuration (encrypted if sensitive)
	additionalConfig: jsonb("additionalConfig").$type<Record<string, unknown>>(),
	// Track when credentials were last validated
	lastValidated: timestamp("lastValidated"),
	isValid: text("isValid").default("unknown"), // "valid" | "invalid" | "unknown"
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const cloudProviderCredentialsRelations = relations(
	cloudProviderCredentials,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [cloudProviderCredentials.organizationId],
			references: [organization.id],
		}),
		provisioningJobs: many(serverProvisioningJob),
	}),
);

/**
 * Server provisioning jobs
 * Tracks the progress of server provisioning operations
 */
export const serverProvisioningJob = pgTable("server_provisioning_job", {
	jobId: text("jobId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	credentialId: text("credentialId")
		.notNull()
		.references(() => cloudProviderCredentials.credentialId, {
			onDelete: "cascade",
		}),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "set null",
	}),
	// Provider-specific server ID (e.g., Hetzner server ID)
	providerServerId: text("providerServerId"),
	// Provider-specific SSH key ID
	providerSshKeyId: text("providerSshKeyId"),
	status: provisioningStatusEnum("status").notNull().default("pending"),
	// Current progress message
	message: text("message"),
	// Error message if failed
	error: text("error"),
	// Configuration used for provisioning
	config: jsonb("config")
		.$type<{
			name: string;
			location: string;
			serverType: string;
			image: string;
			sshKeyIds?: string[];
		}>()
		.notNull(),
	// Provisioning result
	result: jsonb("result").$type<{
		ipv4?: string;
		ipv6?: string;
		serverName?: string;
	}>(),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
	completedAt: timestamp("completedAt"),
});

export const serverProvisioningJobRelations = relations(
	serverProvisioningJob,
	({ one }) => ({
		credential: one(cloudProviderCredentials, {
			fields: [serverProvisioningJob.credentialId],
			references: [cloudProviderCredentials.credentialId],
		}),
		server: one(server, {
			fields: [serverProvisioningJob.serverId],
			references: [server.serverId],
		}),
		organization: one(organization, {
			fields: [serverProvisioningJob.organizationId],
			references: [organization.id],
		}),
	}),
);

// Validation schemas
const createCredentialSchema = createInsertSchema(cloudProviderCredentials, {
	credentialId: z.string().min(1),
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	provider: z.enum(["hetzner"]),
	encryptedApiToken: z.string().min(1),
});

export const apiCreateCloudProviderCredential = createCredentialSchema
	.pick({
		name: true,
		description: true,
		provider: true,
		additionalConfig: true,
	})
	.extend({
		apiToken: z.string().min(1), // Will be encrypted before storage
	});

export const apiUpdateCloudProviderCredential = createCredentialSchema
	.pick({
		credentialId: true,
		name: true,
		description: true,
	})
	.extend({
		apiToken: z.string().min(1).optional(),
	})
	.required({
		credentialId: true,
	});

export const apiFindOneCloudProviderCredential = createCredentialSchema
	.pick({
		credentialId: true,
	})
	.required();

export const apiDeleteCloudProviderCredential = createCredentialSchema
	.pick({
		credentialId: true,
	})
	.required();

const createProvisioningJobSchema = createInsertSchema(serverProvisioningJob, {
	jobId: z.string().min(1),
	config: z.object({
		name: z.string().min(1),
		location: z.string().min(1),
		serverType: z.string().min(1),
		image: z.string().min(1),
		sshKeyIds: z.array(z.string()).optional(),
	}),
});

export const apiCreateProvisioningJob = createProvisioningJobSchema
	.pick({
		credentialId: true,
		config: true,
	})
	.required();

export const apiFindOneProvisioningJob = createProvisioningJobSchema
	.pick({
		jobId: true,
	})
	.required();

export const apiCancelProvisioningJob = createProvisioningJobSchema
	.pick({
		jobId: true,
	})
	.required();
