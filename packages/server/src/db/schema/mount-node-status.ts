import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { mounts } from "./mount";
import { server } from "./server";

export const mountNodeStatusEnum = pgEnum("mountNodeStatus", [
	"pending",
	"mounted",
	"failed",
	"unmounted",
]);

export const mountNodeStatus = pgTable("mount_node_status", {
	mountNodeStatusId: text("mountNodeStatusId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	mountId: text("mountId")
		.notNull()
		.references(() => mounts.mountId, { onDelete: "cascade" }),
	nodeId: text("nodeId").notNull(), // Docker Swarm node ID
	nodeHostname: text("nodeHostname"), // Node hostname/IP for reference
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "set null",
	}),
	mountStatus: mountNodeStatusEnum("mountStatus")
		.notNull()
		.default("pending"),
	lastVerified: timestamp("lastVerified"),
	errorMessage: text("errorMessage"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updatedAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const mountNodeStatusRelations = relations(
	mountNodeStatus,
	({ one }) => ({
		mount: one(mounts, {
			fields: [mountNodeStatus.mountId],
			references: [mounts.mountId],
		}),
		server: one(server, {
			fields: [mountNodeStatus.serverId],
			references: [server.serverId],
		}),
	}),
);

export const apiCreateMountNodeStatus = createInsertSchema(
	mountNodeStatus,
	{
		mountNodeStatusId: z.string().optional(),
		mountId: z.string().min(1),
		nodeId: z.string().min(1),
		nodeHostname: z.string().optional(),
		serverId: z.string().optional(),
		mountStatus: z.enum(["pending", "mounted", "failed", "unmounted"]),
		lastVerified: z.date().optional(),
		errorMessage: z.string().optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
	},
);

export const apiUpdateMountNodeStatus = apiCreateMountNodeStatus
	.partial()
	.extend({
		mountNodeStatusId: z.string().min(1),
	});

