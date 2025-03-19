import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const licenseStatusEnum = pgEnum("license_status", [
	"active",
	"expired",
	"cancelled",
]);

export const licenseTypeEnum = pgEnum("license_type", [
	"basic",
	"premium",
	"business",
]);

export const billingTypeEnum = pgEnum("billing_type", ["monthly", "annual"]);

export const licenses = pgTable("licenses", {
	id: uuid("id").defaultRandom().primaryKey(),
	customerId: text("customer_id").notNull(),
	productId: text("product_id").notNull(),
	licenseKey: text("license_key").notNull().unique(),
	status: licenseStatusEnum("status").notNull().default("active"),
	type: licenseTypeEnum("type").notNull(),
	billingType: billingTypeEnum("billing_type").notNull(),
	serverIp: text("server_ip"),
	activatedAt: timestamp("activated_at"),
	lastVerifiedAt: timestamp("last_verified_at"),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
	metadata: text("metadata"),
	email: text("email").notNull(),
});

export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
