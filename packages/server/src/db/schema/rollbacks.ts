import type { Application } from "@dokploy/server/services/application";
import type { Mount } from "@dokploy/server/services/mount";
import type { Port } from "@dokploy/server/services/port";
import type { Project } from "@dokploy/server/services/project";
import type { Registry } from "@dokploy/server/services/registry";
import { relations } from "drizzle-orm";
import { jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { deployments } from "./deployment";

export const rollbacks = pgTable("rollback", {
	rollbackId: text("rollbackId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	deploymentId: text("deploymentId")
		.notNull()
		.references(() => deployments.deploymentId, {
			onDelete: "cascade",
		}),
	version: serial(),
	image: text("image"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	fullContext: jsonb("fullContext").$type<
		Application & {
			project: Project;
			mounts: Mount[];
			ports: Port[];
			registry?: Registry | null;
		}
	>(),
});

export type Rollback = typeof rollbacks.$inferSelect;

export const rollbacksRelations = relations(rollbacks, ({ one }) => ({
	deployment: one(deployments, {
		fields: [rollbacks.deploymentId],
		references: [deployments.deploymentId],
	}),
}));

export const createRollbackSchema = createInsertSchema(rollbacks).extend({
	appName: z.string().min(1),
});

export const updateRollbackSchema = createRollbackSchema.extend({
	rollbackId: z.string().min(1),
});

export const apiFindOneRollback = z.object({
	rollbackId: z.string().min(1),
});
