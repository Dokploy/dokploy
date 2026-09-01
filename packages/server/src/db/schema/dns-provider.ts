import { jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const dnsProviderType = pgEnum("DnsProviderType", [
	"cloudflare",
	"route53",
	"porkbun",
]);

export const cloudflareDnsConfigSchema = z.object({
	providerType: z.literal("cloudflare"),
	apiToken: z.string().trim().min(1),
});

export const route53DnsConfigSchema = z.object({
	providerType: z.literal("route53"),
	accessKeyId: z.string().trim().min(1),
	secretAccessKey: z.string().trim().min(1),
});

export const porkbunDnsConfigSchema = z.object({
	providerType: z.literal("porkbun"),
	apiKey: z.string().trim().min(1),
	secretApiKey: z.string().trim().min(1),
});

export const dnsProviderConfigSchema = z.discriminatedUnion("providerType", [
	cloudflareDnsConfigSchema,
	route53DnsConfigSchema,
	porkbunDnsConfigSchema,
]);

export type DnsProviderConfig = z.infer<typeof dnsProviderConfigSchema>;

export const dnsProvider = pgTable(
	"dns_provider",
	{
		dnsProviderId: text("dnsProviderId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text("name").notNull(),
		providerType: dnsProviderType("providerType").notNull(),
		config: jsonb("config").$type<DnsProviderConfig>().notNull(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => [
		uniqueIndex("dns_provider_org_name_idx").on(
			table.organizationId,
			table.name,
		),
	],
);

const dnsProviderNameSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(
		/^[a-zA-Z0-9_-]+$/,
		"Name can only contain letters, numbers, dashes and underscores",
	);

const createSchema = createInsertSchema(dnsProvider);

export const apiCreateDnsProvider = createSchema.pick({}).extend({
	name: dnsProviderNameSchema,
	config: dnsProviderConfigSchema,
});

export const apiUpdateDnsProvider = createSchema.pick({}).extend({
	dnsProviderId: z.string().min(1),
	name: dnsProviderNameSchema,
	config: dnsProviderConfigSchema,
});

export const apiFindOneDnsProvider = z.object({
	dnsProviderId: z.string().min(1),
});

export const apiRemoveDnsProvider = z.object({
	dnsProviderId: z.string().min(1),
});

export const apiTestDnsProvider = z.object({
	dnsProviderId: z.string().min(1).optional(),
	config: dnsProviderConfigSchema.optional(),
});

export const apiListDnsZones = z.object({
	dnsProviderId: z.string().min(1),
});

export const apiListDnsRecords = z.object({
	dnsProviderId: z.string().min(1),
	zoneId: z.string().min(1),
});

export const dnsRecordTypes = [
	"A",
	"AAAA",
	"CNAME",
	"MX",
	"TXT",
	"NS",
	"SRV",
	"CAA",
	"PTR",
] as const;

export type DnsRecordType = (typeof dnsRecordTypes)[number];

export const proxiableDnsRecordTypes = ["A", "AAAA", "CNAME"] as const;

const dnsRecordFieldsSchema = z.object({
	type: z.enum(dnsRecordTypes),
	name: z.string().min(1),
	content: z.string().min(1),
	ttl: z.number().int().positive().optional(),
	proxied: z.boolean().optional(),
});

export const apiCreateDnsRecord = dnsRecordFieldsSchema.extend({
	dnsProviderId: z.string().min(1),
	zoneId: z.string().min(1),
});

export const apiUpdateDnsRecord = dnsRecordFieldsSchema.extend({
	dnsProviderId: z.string().min(1),
	zoneId: z.string().min(1),
	recordId: z.string().min(1),
});

export const apiDeleteDnsRecord = z.object({
	dnsProviderId: z.string().min(1),
	zoneId: z.string().min(1),
	recordId: z.string().min(1),
});
