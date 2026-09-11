import { boolean, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { encryptedText } from "./utils";

export const logProviderType = pgEnum("LogProviderType", [
	"loki",
	"datadog",
	"betterstack",
	"elasticsearch",
	"splunk_hec",
	"aws_cloudwatch",
]);

export const logProvider = pgTable("logProvider", {
	logProviderId: text("logProviderId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	providerType: logProviderType("providerType").notNull(),
	endpoint: encryptedText("endpoint"),
	apiKey: encryptedText("apiKey"),
	apiSecret: encryptedText("apiSecret"),
	extraConfig: jsonb("extraConfig").$type<Record<string, unknown>>(),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
});

const createSchema = createInsertSchema(logProvider, {
	logProviderId: z.string().min(1),
	name: z.string().min(1),
	providerType: z.enum([
		"loki",
		"datadog",
		"betterstack",
		"elasticsearch",
		"splunk_hec",
		"aws_cloudwatch",
	]),
	endpoint: z
		.string()
		.min(1)
		.refine((value) => !/\s/.test(value), {
			message: "Endpoint cannot contain whitespace",
		})
		.nullable()
		.optional(),
	apiKey: z.string().min(1).nullable().optional(),
	apiSecret: z.string().min(1).nullable().optional(),
	extraConfig: z.record(z.string(), z.unknown()).nullable().optional(),
	enabled: z.boolean().optional(),
	organizationId: z.string().min(1),
});

export const apiCreateLogProvider = createSchema
	.pick({
		name: true,
		providerType: true,
		endpoint: true,
		apiKey: true,
		apiSecret: true,
		extraConfig: true,
		enabled: true,
	})
	.required({ name: true, providerType: true });

export const apiUpdateLogProvider = apiCreateLogProvider.partial().extend({
	logProviderId: z.string().min(1),
});

export const apiRemoveLogProvider = z.object({
	logProviderId: z.string().min(1),
});

export const apiFindOneLogProvider = z.object({
	logProviderId: z.string().min(1),
});

export const apiTestLogProvider = apiCreateLogProvider.partial({ name: true });
