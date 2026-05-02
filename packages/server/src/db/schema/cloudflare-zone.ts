import { relations } from "drizzle-orm";
import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { cloudflareConfig } from "./cloudflare-config";

export const cloudflareZones = pgTable(
	"cloudflare_zone",
	{
		cloudflareZoneId: text("cloudflareZoneId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		cloudflareConfigId: text("cloudflareConfigId")
			.notNull()
			.references(() => cloudflareConfig.cloudflareConfigId, {
				onDelete: "cascade",
			}),
		zoneId: text("zoneId").notNull(),
		zoneName: text("zoneName").notNull(),
		accountId: text("accountId").notNull(),
		status: text("status"),
		enabled: boolean("enabled").notNull().default(true),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => ({
		orgZoneUnique: uniqueIndex("cloudflare_zone_org_zoneId_unique").on(
			table.organizationId,
			table.zoneId,
		),
	}),
);

export const cloudflareZonesRelations = relations(cloudflareZones, ({ one }) => ({
	organization: one(organization, {
		fields: [cloudflareZones.organizationId],
		references: [organization.id],
	}),
	config: one(cloudflareConfig, {
		fields: [cloudflareZones.cloudflareConfigId],
		references: [cloudflareConfig.cloudflareConfigId],
	}),
}));

const createSchema = createInsertSchema(cloudflareZones);

export const apiAddCloudflareZone = z.object({
	zoneId: z.string().min(1),
	zoneName: z.string().min(1),
	accountId: z.string().min(1),
	status: z.string().optional(),
});

export const apiAddCloudflareZones = z.object({
	zones: z.array(apiAddCloudflareZone).min(1),
});

export const apiToggleCloudflareZone = z.object({
	cloudflareZoneId: z.string().min(1),
	enabled: z.boolean(),
});

export const apiRemoveCloudflareZone = createSchema
	.pick({ cloudflareZoneId: true })
	.required();

export const apiTestCloudflareZone = createSchema
	.pick({ cloudflareZoneId: true })
	.required();
