import { relations } from "drizzle-orm";
import { boolean, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { server } from "./server";

/**
 * Docker network driver types. Only bridge and overlay are supported:
 * "host"/"none" are Docker singletons that cannot be created, and
 * macvlan/ipvlan require driver options (parent interface) we don't expose.
 * Scope is derived from the driver (bridge = local, overlay = swarm), and
 * ingress/config-only networks are not manageable from Dokploy.
 */
export const networkDriver = pgEnum("networkDriver", ["bridge", "overlay"]);

export const network = pgTable("network", {
	networkId: text("networkId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	driver: networkDriver("driver").notNull().default("bridge"),
	internal: boolean("internal").notNull().default(false),
	attachable: boolean("attachable").notNull().default(false),
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
	driver: z.enum(["bridge", "overlay"]).optional(),
	internal: z.boolean().optional(),
	attachable: z.boolean().optional(),
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

const validateNetworkInput = (
	input: {
		enableIPv4?: boolean;
		enableIPv6?: boolean;
		ipam?: {
			config?: Array<{ subnet?: string; gateway?: string; ipRange?: string }>;
		} | null;
	},
	ctx: z.RefinementCtx,
) => {
	if (input.enableIPv4 === false && input.enableIPv6 !== true) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["enableIPv4"],
			message: "IPv4 or IPv6 must be enabled",
		});
	}
	for (const [index, entry] of (input.ipam?.config ?? []).entries()) {
		if (!entry.subnet && (entry.gateway || entry.ipRange)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["ipam", "config", index, "subnet"],
				message: "Gateway and IP range require a subnet",
			});
		}
	}
};

export const apiCreateNetwork = createSchema
	.pick({
		name: true,
		driver: true,
		internal: true,
		attachable: true,
		enableIPv4: true,
		enableIPv6: true,
		ipam: true,
		serverId: true,
	})
	.partial()
	.required({ name: true })
	.superRefine(validateNetworkInput);

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
