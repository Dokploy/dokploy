import { auth } from "./auth";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// export const sessionTable = sqliteTable("session", {
//   id: text("id").notNull().primaryKey(),
//   userId: text("user_id")
//     .notNull()
//     .references(() => users.id),
//   expiresAt: integer("expires_at").notNull(),
// });
export const sessionTable = pgTable("session", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => auth.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at", {
		withTimezone: true,
		mode: "date",
	}).notNull(),
});
