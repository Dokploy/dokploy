import { relations } from "drizzle-orm";
import { integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";

export const protocolType = pgEnum("protocolType", ["tcp", "udp"]);
export const publishModeType = pgEnum("publishModeType", ["ingress", "host"]);

export const ports = pgTable("port", {
	portId: text("portId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	publishedPort: integer("publishedPort").notNull(),
	publishMode: publishModeType("publishMode").notNull().default("host"),
	targetPort: integer("targetPort").notNull(),
	protocol: protocolType("protocol").notNull(),

	applicationId: text("applicationId")
		.notNull()
		.references(() => applications.applicationId, { onDelete: "cascade" }),
});

export const portsRelations = relations(ports, ({ one }) => ({
	application: one(applications, {
		fields: [ports.applicationId],
		references: [applications.applicationId],
	}),
}));

const createSchema = createInsertSchema(ports, {
	portId: z.string().min(1),
	applicationId: z.string().min(1),
	publishedPort: z.number(),
	publishMode: z.enum(["ingress", "host"]).default("ingress"),
	targetPort: z.number(),
	protocol: z.enum(["tcp", "udp"]).default("tcp"),
});

export const apiCreatePort = createSchema
	.pick({
		publishedPort: true,
		publishMode: true,
		targetPort: true,
		protocol: true,
		applicationId: true,
	})
	.required();

export const apiFindOnePort = createSchema
	.pick({
		portId: true,
	})
	.required();

export const apiUpdatePort = createSchema
	.pick({
		portId: true,
		publishedPort: true,
		publishMode: true,
		targetPort: true,
		protocol: true,
	})
	.required();
