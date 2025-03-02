import { relations } from "drizzle-orm";
import { boolean, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";

import { admins } from "./admin";
import { applications } from "./application";
import { certificates } from "./certificate";
import { compose } from "./compose";
import { deployments } from "./deployment";
import { mariadb } from "./mariadb";
import { mongo } from "./mongo";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { redis } from "./redis";
import { sshKeys } from "./ssh-key";
import { generateAppName } from "./utils";

export const serverStatus = pgEnum("serverStatus", ["active", "inactive"]);

export const server = pgTable("server", {
	serverId: text("serverId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	description: text("description"),
	ipAddress: text("ipAddress").notNull(),
	port: integer("port").notNull(),
	username: text("username").notNull().default("root"),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("server")),
	enableDockerCleanup: boolean("enableDockerCleanup").notNull().default(false),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	adminId: text("adminId")
		.notNull()
		.references(() => admins.adminId, { onDelete: "cascade" }),
	serverStatus: serverStatus("serverStatus").notNull().default("active"),
	command: text("command").notNull().default(""),
	sshKeyId: text("sshKeyId").references(() => sshKeys.sshKeyId, {
		onDelete: "set null",
	}),
});

export const serverRelations = relations(server, ({ one, many }) => ({
	admin: one(admins, {
		fields: [server.adminId],
		references: [admins.adminId],
	}),
	deployments: many(deployments),
	sshKey: one(sshKeys, {
		fields: [server.sshKeyId],
		references: [sshKeys.sshKeyId],
	}),
	applications: many(applications),
	compose: many(compose),
	redis: many(redis),
	mariadb: many(mariadb),
	mongo: many(mongo),
	mysql: many(mysql),
	postgres: many(postgres),
	certificates: many(certificates),
}));

const createSchema = createInsertSchema(server, {
	serverId: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
});

export const apiCreateServer = createSchema
	.pick({
		name: true,
		description: true,
		ipAddress: true,
		port: true,
		username: true,
		sshKeyId: true,
	})
	.required();

export const apiFindOneServer = createSchema
	.pick({
		serverId: true,
	})
	.required();

export const apiRemoveServer = createSchema
	.pick({
		serverId: true,
	})
	.required();

export const apiUpdateServer = createSchema
	.pick({
		name: true,
		description: true,
		serverId: true,
		ipAddress: true,
		port: true,
		username: true,
		sshKeyId: true,
	})
	.required()
	.extend({
		command: z.string().optional(),
	});
