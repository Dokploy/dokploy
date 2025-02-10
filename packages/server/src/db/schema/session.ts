import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./user";

// OLD TABLE
export const sessionTable = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => users.id),
	impersonatedBy: text("impersonated_by"),
});
