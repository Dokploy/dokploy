import { relations } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { cloudflareZones } from "./cloudflare-zone";

export const cloudflareConfig = pgTable(
	"cloudflare_config",
	{
		cloudflareConfigId: text("cloudflareConfigId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		apiToken: text("apiToken").notNull(),
		accountId: text("accountId").notNull(),
		accountName: text("accountName"),
		tokenScopes: text("tokenScopes").array(),
		verifiedAt: text("verifiedAt"),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		updatedAt: text("updatedAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => ({
		orgUnique: uniqueIndex("cloudflare_config_organizationId_unique").on(
			table.organizationId,
		),
	}),
);

export const cloudflareConfigRelations = relations(
	cloudflareConfig,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [cloudflareConfig.organizationId],
			references: [organization.id],
		}),
		zones: many(cloudflareZones),
	}),
);

const createSchema = createInsertSchema(cloudflareConfig, {
	apiToken: z.string().min(1),
});

export const apiSaveCloudflareToken = z.object({
	apiToken: z.string().min(1),
});

export const apiVerifyCloudflareToken = z.object({
	apiToken: z.string().min(1),
});

export const apiDeleteCloudflareConfig = createSchema
	.pick({ cloudflareConfigId: true })
	.required();
