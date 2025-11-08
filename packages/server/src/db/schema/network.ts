import { relations } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { applications } from "./application";
import { compose } from "./compose";
import { mariadb } from "./mariadb";
import { mongo } from "./mongo";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { projects } from "./project";
import { redis } from "./redis";
import { server } from "./server";

export const networkDriver = pgEnum("networkDriver", ["bridge", "overlay"]);
export type NetworkDriver = (typeof networkDriver.enumValues)[number];

const IPV4_REGEX =
	/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const CIDR_REGEX =
	/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;
const NETWORK_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export const networks = pgTable("network", {
	networkId: text("networkId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	description: text("description"),
	networkName: text("networkName").notNull(),
	driver: networkDriver("driver").notNull().default("bridge"),
	subnet: text("subnet"),
	gateway: text("gateway"),
	ipRange: text("ipRange"),
	internal: boolean("internal").notNull().default(false),
	encrypted: boolean("encrypted").notNull().default(false),
	dockerNetworkId: text("dockerNetworkId"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	projectId: text("projectId").references(() => projects.projectId, {
		onDelete: "set null",
	}),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "set null",
	}),
});

export const networkRelations = relations(networks, ({ one, many }) => ({
	project: one(projects, {
		fields: [networks.projectId],
		references: [projects.projectId],
	}),
	organization: one(organization, {
		fields: [networks.organizationId],
		references: [organization.id],
	}),
	server: one(server, {
		fields: [networks.serverId],
		references: [server.serverId],
	}),
	applications: many(applications),
	composes: many(compose),
	postgres: many(postgres),
	mysql: many(mysql),
	mariadb: many(mariadb),
	mongo: many(mongo),
	redis: many(redis),
}));

const createSchema = createInsertSchema(networks, {
	networkId: z.string().min(1),
	name: z.string().min(1).max(50),
	networkName: z
		.string()
		.min(1)
		.max(63)
		.regex(
			NETWORK_NAME_REGEX,
			"Network name must start with alphanumeric and contain only alphanumeric, underscore, period, or hyphen",
		),
	subnet: z
		.string()
		.regex(CIDR_REGEX, "Invalid subnet format (e.g., 172.20.0.0/16)")
		.optional(),
	gateway: z
		.string()
		.regex(IPV4_REGEX, "Invalid gateway IP address")
		.optional(),
	ipRange: z.string().regex(CIDR_REGEX, "Invalid IP range format").optional(),
});

export const apiCreateNetwork = createSchema
	.pick({
		name: true,
		description: true,
		networkName: true,
		driver: true,
		subnet: true,
		gateway: true,
		ipRange: true,
		internal: true,
		encrypted: true,
		projectId: true,
		organizationId: true,
		serverId: true,
	})
	.extend({
		projectId: z.string().optional(),
		organizationId: z.string().min(1).optional(),
	});

export const apiFindOneNetwork = createSchema
	.pick({
		networkId: true,
	})
	.required();

export const apiRemoveNetwork = createSchema
	.pick({
		networkId: true,
	})
	.required();

export const apiUpdateNetwork = createSchema
	.partial()
	.extend({
		networkId: z.string().min(1),
	})
	.omit({ dockerNetworkId: true, createdAt: true });

const RESOURCE_TYPES = [
	"application",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
] as const;

export type NetworkResourceType = (typeof RESOURCE_TYPES)[number];

const networkResourceSchema = z.object({
	networkId: z.string().min(1),
	resourceId: z.string().min(1),
	resourceType: z.enum(RESOURCE_TYPES),
});

export const apiAssignNetworkToResource = networkResourceSchema;
export const apiRemoveNetworkFromResource = networkResourceSchema;

export type Network = typeof networks.$inferSelect;
export type NetworkInsert = typeof networks.$inferInsert;
