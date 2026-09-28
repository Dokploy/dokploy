import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// 1. Owner, Admin aur View-Only roles matrix enum inject karein
export const roleEnum = pgEnum("role", ["OWNER", "ADMIN", "VIEW_ONLY"]);

// 2. Teams grouping integration scheme properties layout
export const teams = pgTable("teams", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  organizationId: text("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

