import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users_temp } from "./user";

// OLD TABLE
export const session = pgTable("session_temp", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => users_temp.id, { onDelete: "cascade" }),
	impersonatedBy: text("impersonated_by"),
	activeOrganizationId: text("active_organization_id"),
});
