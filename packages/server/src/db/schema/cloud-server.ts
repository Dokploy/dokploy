import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";
import { sshKeys } from "./ssh-key";

export const cloudServerStatus = pgEnum("cloudServerStatus", [
	"pending",
	"provisioning",
	"configuring",
	"ready",
	"upgrading",
	"error",
	"suspended",
	"terminating",
]);

export const cloudServer = pgTable("cloud_server", {
	cloudServerId: text("cloudServerId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "set null",
	}),
	plan: text("plan").notNull(),
	status: cloudServerStatus("status").notNull().default("pending"),
	providerVmId: text("providerVmId"),
	providerNetworkId: text("providerNetworkId"),
	providerFirewallId: text("providerFirewallId"),
	zone: text("zone").notNull(),
	sshKeyId: text("sshKeyId").references(() => sshKeys.sshKeyId, {
		onDelete: "set null",
	}),
	ipAddress: text("ipAddress"),
	hostname: text("hostname"),
	stripeSubscriptionId: text("stripeSubscriptionId"),
	stripeCheckoutSessionId: text("stripeCheckoutSessionId"),
	suspendedAt: text("suspendedAt"),
	errorMessage: text("errorMessage"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updatedAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const cloudServerRelations = relations(cloudServer, ({ one }) => ({
	organization: one(organization, {
		fields: [cloudServer.organizationId],
		references: [organization.id],
	}),
	server: one(server, {
		fields: [cloudServer.serverId],
		references: [server.serverId],
	}),
}));

export const apiCreateCloudServer = z.object({
	plan: z.string().min(1),
	zone: z.string().min(1),
});

export const apiFindOneCloudServer = z.object({
	cloudServerId: z.string().min(1),
});

export const apiDeleteCloudServer = z.object({
	cloudServerId: z.string().min(1),
});

export const apiCloudServerPowerAction = z.object({
	cloudServerId: z.string().min(1),
	action: z.enum(["reboot", "shutdown", "power_on"]),
});

export const apiFindCloudServerAction = z.object({
	cloudServerId: z.string().min(1),
	actionId: z.number().int(),
});

export const apiUpgradeCloudServer = z.object({
	cloudServerId: z.string().min(1),
	plan: z.string().min(1),
});

const portRangeSchema = z
	.string()
	.regex(/^\d{1,5}(-\d{1,5})?$/, "Use a port (8080) or a range (8000-9000)")
	.refine((value) => {
		const [start, end = start] = value.split("-").map(Number);
		return start! >= 1 && end! <= 65535 && start! <= end!;
	}, "Ports must be between 1 and 65535");

export const firewallRuleSchema = z.discriminatedUnion("protocol", [
	z.object({
		protocol: z.enum(["tcp", "udp"]),
		ports: portRangeSchema,
		sources: z
			.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]))
			.min(1)
			.max(20),
	}),
	z.object({
		protocol: z.literal("icmp"),
		sources: z
			.array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]))
			.min(1)
			.max(20),
	}),
]);

export type FirewallRule = z.infer<typeof firewallRuleSchema>;

export const apiUpdateCloudServerFirewall = z.object({
	cloudServerId: z.string().min(1),
	rules: z.array(firewallRuleSchema).max(40),
});
