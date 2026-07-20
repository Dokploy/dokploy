import { relations, sql } from "drizzle-orm";
import {
	boolean,
	jsonb,
	pgEnum,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";

export const networkDriver = pgEnum("networkDriver", [
	"bridge",
	"host",
	"overlay",
	"macvlan",
	"none",
	"ipvlan",
]);

export const network = pgTable(
	"network",
	{
		networkId: text("networkId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text("name").notNull(),
		driver: networkDriver("driver").notNull().default("bridge"),
		scope: text("scope"),
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
	},
	(t) => [
		// Docker enforces unique network names per daemon (per server). Mirror
		// that at the DB layer so two concurrent creates of the same name on the
		// same server fail with a clean SQL constraint instead of an opaque
		// Docker error after the row is already inserted. We COALESCE serverId
		// to '' so host-level networks (serverId IS NULL) collapse into a single
		// bucket — Drizzle 0.45 doesn't expose `nullsNotDistinct()` on
		// uniqueIndex, so this is the equivalent.
		uniqueIndex("network_name_serverId_idx").on(
			t.name,
			sql`COALESCE(${t.serverId}, '')`,
		),
	],
);

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
	name: z
		.string()
		.min(1)
		.max(64)
		.regex(
			/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
			"Network name must start with a letter or digit and contain only letters, digits, '_', '.' or '-'",
		)
		.refine(
			(n) =>
				![
					"dokploy-network",
					"host",
					"bridge",
					"none",
					"ingress",
					"docker_gwbridge",
				].includes(n),
			{
				message:
					"This name is reserved (dokploy-network, host, bridge, none, ingress, docker_gwbridge).",
			},
		),
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
