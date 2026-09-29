import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const orgTeams = pgTable("org_teams", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  organizationId: text("organization_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
