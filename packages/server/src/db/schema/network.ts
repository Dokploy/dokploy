import { relations } from "drizzle-orm";
import { boolean, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";

/** Docker network driver types */
export const networkDriver = pgEnum("networkDriver", [
	"bridge",
	"host",
	"overlay",
	"macvlan",
	"none",
	"ipvlan",
]);

export const network = pgTable("network", {
	networkId: text("networkId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	driver: networkDriver("driver").notNull().default("bridge"),
	scope: text("scope"), // e.g. "local", "swarm"
	internal: boolean("internal").notNull().default(false),
	attachable: boolean("attachable").notNull().default(false),
	ingress: boolean("ingress").notNull().default(false),
	configOnly: boolean("configOnly").notNull().default(false),
	enableIPv4: boolean("enableIPv4").notNull().default(true),
	enableIPv6: boolean("enableIPv6").notNull().default(false),
	ipam: jsonb("ipam")
		.$type<{
			driver?: string;
			config?: Array<{ subnet?: string; gateway?: string; ipRange?: string }>;
		}>()
		.default({}),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const networkRelations = relations(network, ({ one }) => ({
	organization: one(organization, {
		fields: [network.organizationId],
		references: [organization.id],
	}),
	server: one(server, {
		fields: [network.serverId],
		references: [server.serverId],
	}),
}));

const createSchema = createInsertSchema(network, {
	networkId: z.string().min(1),
	name: z.string().min(1),
	driver: z
		.enum(["bridge", "host", "overlay", "macvlan", "none", "ipvlan"])
		.optional(),
	scope: z.string().optional(),
	internal: z.boolean().optional(),
	attachable: z.boolean().optional(),
	ingress: z.boolean().optional(),
	configOnly: z.boolean().optional(),
	enableIPv4: z.boolean().optional(),
	enableIPv6: z.boolean().optional(),
	ipam: z
		.object({
			driver: z.string().optional(),
			config: z
				.array(
					z.object({
						subnet: z.string().optional(),
						gateway: z.string().optional(),
						ipRange: z.string().optional(),
					}),
				)
				.optional(),
		})
		.optional(),
	organizationId: z.string().min(1),
	serverId: z.string().optional().nullable(),
});

export const apiCreateNetwork = createSchema
	.pick({
		name: true,
		driver: true,
		scope: true,
		internal: true,
		attachable: true,
		ingress: true,
		configOnly: true,
		enableIPv4: true,
		enableIPv6: true,
		ipam: true,
		serverId: true,
	})
	.partial()
	.required({ name: true });

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
	.pick({
		networkId: true,
		name: true,
		driver: true,
		scope: true,
		internal: true,
		attachable: true,
		ingress: true,
		configOnly: true,
		enableIPv4: true,
		enableIPv6: true,
		ipam: true,
		serverId: true,
	})
	.partial()
	.required({ networkId: true });
