import { nanoid } from "nanoid";
import {
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { users_temp } from "./user";

export const ssoProvider = pgTable(
	"sso_provider",
	{
		id: text("id")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		providerId: text("provider_id").notNull(),
		issuer: text("issuer").notNull(),
		domain: text("domain").notNull(),
		oidcConfig: text("oidc_config"),
		samlConfig: text("saml_config"),
		userId: text("user_id").references(() => users_temp.id, {
			onDelete: "set null",
		}),
		organizationId: text("organization_id"),
		createdAt: timestamp("created_at", { mode: "date" })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { mode: "date" })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("sso_provider_provider_id_unq").on(table.providerId),
	],
);
