import { relations } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { tunnelStatus } from "./server";

export const localServer = pgTable(
	"local_server",
	{
		localServerId: text("localServerId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		tunnelStatus: tunnelStatus("tunnelStatus").notNull().default("disabled"),
		tunnelId: text("tunnelId"),
		tunnelToken: text("tunnelToken"),
		tunnelAccountId: text("tunnelAccountId"),
		tunnelError: text("tunnelError"),
		tunnelCheckedAt: text("tunnelCheckedAt"),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
	},
	(table) => ({
		orgUnique: uniqueIndex("local_server_organizationId_unique").on(
			table.organizationId,
		),
	}),
);

export const localServerRelations = relations(localServer, ({ one }) => ({
	organization: one(organization, {
		fields: [localServer.organizationId],
		references: [organization.id],
	}),
}));

const createSchema = createInsertSchema(localServer);

export const apiProvisionLocalTunnel = z.object({
	tunnelAccountId: z.string().min(1).optional(),
});

export const apiUpdateLocalTunnelAccount = z.object({
	tunnelAccountId: z.string().min(1),
});

export type LocalServer = typeof localServer.$inferSelect;
export type LocalServerInsert = typeof localServer.$inferInsert;
export { createSchema as localServerInsertSchema };
