import { relations } from "drizzle-orm";
import {
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";
import { sshKeys } from "./ssh-key";

export const clusterMeshStatus = pgEnum("clusterMeshStatus", [
	"provisioning",
	"ready",
	"error",
]);

export const clusterNodeRole = pgEnum("clusterNodeRole", ["manager", "worker"]);

export const clusterNodeStatus = pgEnum("clusterNodeStatus", [
	"provisioning",
	"paused",
	"active",
	"drained",
	"error",
	"removing",
]);

/**
 * The WireGuard network joining the VMs of one swarm: the Dokploy host's
 * swarm (`swarmKey` "local") or a remote server's swarm (its serverId).
 */
export const clusterMesh = pgTable("cluster_mesh", {
	meshId: text("meshId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	swarmKey: text("swarmKey").notNull().unique(),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
	subnet: text("subnet").notNull().default("100.96.0.0/24"),
	listenPort: integer("listenPort").notNull().default(51820),
	wgMtu: integer("wgMtu").notNull().default(1420),
	managerAdvertiseAddress: text("managerAdvertiseAddress"),
	status: clusterMeshStatus("status").notNull().default("provisioning"),
	lastError: text("lastError"),
	createdAt: timestamp("createdAt").defaultNow().notNull(),
	updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const clusterNode = pgTable(
	"cluster_node",
	{
		clusterNodeId: text("clusterNodeId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		meshId: text("meshId")
			.notNull()
			.references(() => clusterMesh.meshId, { onDelete: "cascade" }),
		name: text("name").notNull(),
		role: clusterNodeRole("role").notNull(),
		sshAddress: text("sshAddress").notNull(),
		sshPort: integer("sshPort").notNull().default(22),
		sshUser: text("sshUser").notNull().default("root"),
		sshKeyId: text("sshKeyId").references(() => sshKeys.sshKeyId, {
			onDelete: "set null",
		}),
		endpointAddress: text("endpointAddress").notNull(),
		wgAddress: text("wgAddress").notNull(),
		wgPublicKey: text("wgPublicKey"),
		swarmNodeId: text("swarmNodeId"),
		status: clusterNodeStatus("status").notNull().default("provisioning"),
		lastError: text("lastError"),
		log: text("log").notNull().default(""),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
		updatedAt: timestamp("updatedAt").defaultNow().notNull(),
	},
	(t) => ({
		meshAddress: uniqueIndex("clusterNode_meshId_wgAddress_idx").on(
			t.meshId,
			t.wgAddress,
		),
	}),
);

export const clusterMeshRelations = relations(clusterMesh, ({ one, many }) => ({
	server: one(server, {
		fields: [clusterMesh.serverId],
		references: [server.serverId],
	}),
	nodes: many(clusterNode),
}));

export const clusterNodeRelations = relations(clusterNode, ({ one }) => ({
	mesh: one(clusterMesh, {
		fields: [clusterNode.meshId],
		references: [clusterMesh.meshId],
	}),
	sshKey: one(sshKeys, {
		fields: [clusterNode.sshKeyId],
		references: [sshKeys.sshKeyId],
	}),
}));

export type ClusterMesh = typeof clusterMesh.$inferSelect;
export type ClusterNode = typeof clusterNode.$inferSelect;

const hostname = z
	.string()
	.trim()
	.min(1)
	.max(253)
	.regex(/^[A-Za-z0-9.:[\]-]+$/, "Enter an IP address or host name");

export const sshAccess = z.object({
	sshAddress: hostname,
	sshPort: z.number().int().min(1).max(65535).default(22),
	sshUser: z
		.string()
		.trim()
		.regex(/^[a-z_][a-z0-9_-]{0,31}$/, "Enter a Linux user name")
		.default("root"),
	sshKeyId: z.string().min(1),
	endpointAddress: hostname,
});

export const apiFindClusterMesh = z.object({
	serverId: z.string().min(1).optional(),
});

export const apiEnableClusterMesh = z.object({
	serverId: z.string().min(1).optional(),
	subnet: z
		.string()
		.regex(
			/^(\d{1,3}\.){3}\d{1,3}\/(1[6-9]|2[0-8])$/,
			"Enter an IPv4 subnet from /16 to /28",
		)
		.default("100.96.0.0/24"),
	listenPort: z.number().int().min(1024).max(65535).default(51820),
	manager: sshAccess,
});

export const apiAddClusterNode = sshAccess.extend({
	meshId: z.string().min(1),
	name: z
		.string()
		.trim()
		.min(1)
		.max(63)
		.regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "Use letters, digits and dashes"),
});

export const apiClusterNode = z.object({
	clusterNodeId: z.string().min(1),
});

export const apiActivateClusterNode = apiClusterNode.extend({
	acknowledgeFindings: z.boolean().default(false),
});

export const apiSetClusterNodeAvailability = apiClusterNode.extend({
	availability: z.enum(["active", "pause", "drain"]),
	acknowledgeFindings: z.boolean().default(false),
});

export const apiRemoveClusterNode = apiClusterNode.extend({
	force: z.boolean().default(false),
});

export const apiFindClusterPreflight = z.object({
	meshId: z.string().min(1),
});
