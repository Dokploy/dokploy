import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Owner, Admin aur View-Only roles database enum definitions layer
export const roleEnum = pgEnum("role", ["OWNER", "ADMIN", "VIEW_ONLY"]);

// Teams grouping system infrastructure mapping table properties
export const teams = pgTable("teams", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  organizationId: text("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

