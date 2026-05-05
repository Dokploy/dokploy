import { relations } from "drizzle-orm";
import { integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";

export const managedServerStatus = pgEnum("managedServerStatus", [
	"pending",
	"provisioning",
	"configuring",
	"ready",
	"error",
	"terminating",
	"terminated",
]);

export const managedServer = pgTable("managed_server", {
	managedServerId: text("managedServerId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "set null",
	}),
	/** Hostinger catalog item id, e.g. "hostingercom-vps-kvm2" */
	plan: text("plan").notNull(),
	status: managedServerStatus("status").notNull().default("pending"),
	hostingerVmId: integer("hostingerVmId"),
	hostingerSubscriptionId: text("hostingerSubscriptionId"),
	dataCenterId: integer("dataCenterId").notNull(),
	ipAddress: text("ipAddress"),
	hostname: text("hostname"),
	stripeSubscriptionId: text("stripeSubscriptionId"),
	stripePriceId: text("stripePriceId"),
	rootPassword: text("rootPassword"),
	errorMessage: text("errorMessage"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updatedAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const managedServerRelations = relations(managedServer, ({ one }) => ({
	organization: one(organization, {
		fields: [managedServer.organizationId],
		references: [organization.id],
	}),
	server: one(server, {
		fields: [managedServer.serverId],
		references: [server.serverId],
	}),
}));

export const apiCreateManagedServer = z.object({
	plan: z.string().min(1),
	dataCenterId: z.number().int().positive(),
	isAnnual: z.boolean().default(false),
});

export const apiFindOneManagedServer = z.object({
	managedServerId: z.string().min(1),
});

export const apiDeleteManagedServer = z.object({
	managedServerId: z.string().min(1),
});
