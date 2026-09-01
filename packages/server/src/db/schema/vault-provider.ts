import { jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const vaultProviderType = pgEnum("VaultProviderType", [
	"hashicorp",
	"infisical",
	"aws",
	"doppler",
	"azure",
	"scaleway",
	"phase",
]);

export const hashicorpVaultConfigSchema = z.object({
	providerType: z.literal("hashicorp"),
	url: z.string().url(),
	token: z.string().min(1),
	namespace: z.string().optional(),
	mount: z.string().min(1).default("secret"),
});

export const infisicalVaultConfigSchema = z.object({
	providerType: z.literal("infisical"),
	siteUrl: z.string().url().default("https://app.infisical.com"),
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
	projectId: z.string().min(1),
	environmentSlug: z.string().min(1),
	secretPath: z.string().default("/"),
});

export const awsVaultConfigSchema = z.object({
	providerType: z.literal("aws"),
	region: z.string().min(1),
	accessKeyId: z.string().min(1),
	secretAccessKey: z.string().min(1),
	endpoint: z.string().url().optional(),
});

export const dopplerVaultConfigSchema = z.object({
	providerType: z.literal("doppler"),
	serviceToken: z.string().min(1),
	project: z.string().optional(),
	config: z.string().optional(),
});

export const azureVaultConfigSchema = z.object({
	providerType: z.literal("azure"),
	vaultUri: z.string().url(),
	tenantId: z.string().min(1),
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
});

export const scalewayVaultConfigSchema = z.object({
	providerType: z.literal("scaleway"),
	region: z.string().min(1).default("fr-par"),
	projectId: z.string().min(1),
	secretKey: z.string().min(1),
	apiUrl: z.string().url().default("https://api.scaleway.com"),
});

export const phaseVaultConfigSchema = z.object({
	providerType: z.literal("phase"),
	token: z.string().min(1),
	appId: z.string().min(1),
	env: z.string().min(1),
	path: z.string().default("/"),
	apiUrl: z.string().url().default("https://api.phase.dev"),
});

export const vaultProviderConfigSchema = z.discriminatedUnion("providerType", [
	hashicorpVaultConfigSchema,
	infisicalVaultConfigSchema,
	awsVaultConfigSchema,
	dopplerVaultConfigSchema,
	azureVaultConfigSchema,
	scalewayVaultConfigSchema,
	phaseVaultConfigSchema,
]);

export type VaultProviderConfig = z.infer<typeof vaultProviderConfigSchema>;

export const vaultProviderAssignmentSchema = z.object({
	projectId: z.string().min(1),
	environmentIds: z.array(z.string().min(1)).default([]),
});

export type VaultProviderAssignment = z.infer<
	typeof vaultProviderAssignmentSchema
>;

export const vaultProvider = pgTable(
	"vault_provider",
	{
		vaultProviderId: text("vaultProviderId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text("name").notNull(),
		providerType: vaultProviderType("providerType").notNull(),
		config: jsonb("config").$type<VaultProviderConfig>().notNull(),
		assignments: jsonb("assignments")
			.$type<VaultProviderAssignment[]>()
			.notNull()
			.default([]),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => [
		uniqueIndex("vault_provider_org_name_idx").on(
			table.organizationId,
			table.name,
		),
	],
);

const vaultProviderNameSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(
		/^[a-zA-Z0-9_-]+$/,
		"Name can only contain letters, numbers, dashes and underscores",
	);

const createSchema = createInsertSchema(vaultProvider);

export const apiCreateVaultProvider = createSchema.pick({}).extend({
	name: vaultProviderNameSchema,
	config: vaultProviderConfigSchema,
	assignments: z.array(vaultProviderAssignmentSchema),
});

export const apiUpdateVaultProvider = createSchema.pick({}).extend({
	vaultProviderId: z.string().min(1),
	name: vaultProviderNameSchema,
	config: vaultProviderConfigSchema,
	assignments: z.array(vaultProviderAssignmentSchema),
});

export const apiFindOneVaultProvider = z.object({
	vaultProviderId: z.string().min(1),
});

export const apiRemoveVaultProvider = z.object({
	vaultProviderId: z.string().min(1),
});

export const apiTestVaultProvider = z.object({
	vaultProviderId: z.string().min(1).optional(),
	config: vaultProviderConfigSchema.optional(),
});

export const apiListVaultSecretNames = z.object({
	vaultProviderId: z.string().min(1),
	projectId: z.string().min(1),
	environmentId: z.string().optional(),
});
