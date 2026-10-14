import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { organization } from "./account";

export const scimProvider = pgTable("scim_provider", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	providerId: text("provider_id").notNull().unique(),
	scimToken: text("scim_token").notNull().unique(),
	organizationId: text("organization_id").references(() => organization.id, {
		onDelete: "cascade",
	}),
});

export const scimProviderRelations = relations(scimProvider, ({ one }) => ({
	organization: one(organization, {
		fields: [scimProvider.organizationId],
		references: [organization.id],
	}),
}));
