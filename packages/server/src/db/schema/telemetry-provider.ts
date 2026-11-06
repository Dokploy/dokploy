import { boolean, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { encryptedText } from "./utils";

export const telemetryProviderType = pgEnum("TelemetryProviderType", [
	"loki",
	"datadog",
	"betterstack",
	"elasticsearch",
	"splunk_hec",
	"aws_cloudwatch",
	"prometheus_remote_write",
	"new_relic",
	"influxdb",
]);

export const telemetryProvider = pgTable("telemetryProvider", {
	telemetryProviderId: text("telemetryProviderId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	providerType: telemetryProviderType("providerType").notNull(),
	signals: text("signals").array().notNull(),
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

const createSchema = createInsertSchema(telemetryProvider, {
	telemetryProviderId: z.string().min(1),
	name: z.string().min(1),
	providerType: z.enum(telemetryProviderType.enumValues),
	signals: z.array(z.enum(["logs", "metrics"])).min(1),
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

export const apiCreateTelemetryProvider = createSchema
	.pick({
		name: true,
		providerType: true,
		signals: true,
		endpoint: true,
		apiKey: true,
		apiSecret: true,
		extraConfig: true,
		enabled: true,
	})
	.required({ name: true, providerType: true, signals: true });

export const apiUpdateTelemetryProvider = apiCreateTelemetryProvider
	.partial()
	.extend({
		telemetryProviderId: z.string().min(1),
	});

export const apiRemoveTelemetryProvider = z.object({
	telemetryProviderId: z.string().min(1),
});

export const apiFindOneTelemetryProvider = z.object({
	telemetryProviderId: z.string().min(1),
});

export const apiTestTelemetryProvider = apiCreateTelemetryProvider.partial({
	name: true,
});
