import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";
import { sshKeys } from "./ssh-key";

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
	/** UpCloud plan name, e.g. "2xCPU-4GB" */
	plan: text("plan").notNull(),
	status: managedServerStatus("status").notNull().default("pending"),
	/** UpCloud server UUID */
	providerVmId: text("providerVmId"),
	/** UpCloud zone ID, e.g. "fi-hel1" */
	zone: text("zone").notNull(),
	/** SSH key used to access this server */
	sshKeyId: text("sshKeyId").references(() => sshKeys.sshKeyId, {
		onDelete: "set null",
	}),
	ipAddress: text("ipAddress"),
	hostname: text("hostname"),
	stripeSubscriptionId: text("stripeSubscriptionId"),
	stripePriceId: text("stripePriceId"),
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
	zone: z.string().min(1),
});

export const apiFindOneManagedServer = z.object({
	managedServerId: z.string().min(1),
});

export const apiDeleteManagedServer = z.object({
	managedServerId: z.string().min(1),
});
