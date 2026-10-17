import { relations } from "drizzle-orm";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { domains } from "./domain";
import { environments } from "./environment";
import { server } from "./server";
import { applicationStatus } from "./shared";
import {
	APP_NAME_MESSAGE,
	APP_NAME_REGEX,
	buildAppName,
	generateAppName,
} from "./utils";

export const externalUpstreams = pgTable("externalUpstream", {
	externalUpstreamId: text("externalUpstreamId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("external-upstream"))
		.unique(),
	description: text("description"),
	targetUrl: text("targetUrl").notNull(),
	passHostHeader: boolean("passHostHeader").notNull().default(true),
	applicationStatus: applicationStatus("applicationStatus")
		.notNull()
		.default("idle"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	environmentId: text("environmentId")
		.notNull()
		.references(() => environments.environmentId, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const externalUpstreamsRelations = relations(
	externalUpstreams,
	({ one, many }) => ({
		environment: one(environments, {
			fields: [externalUpstreams.environmentId],
			references: [environments.environmentId],
		}),
		server: one(server, {
			fields: [externalUpstreams.serverId],
			references: [server.serverId],
		}),
		domains: many(domains),
	}),
);

const createSchema = createInsertSchema(externalUpstreams, {
	name: z.string().min(1),
	appName: z
		.string()
		.min(1)
		.max(63)
		.regex(APP_NAME_REGEX, APP_NAME_MESSAGE)
		.optional(),
	description: z.string().optional(),
	targetUrl: z.string().min(1),
	passHostHeader: z.boolean().optional(),
	environmentId: z.string().min(1),
	serverId: z.string().optional(),
});

export const apiCreateExternalUpstream = createSchema.pick({
	name: true,
	appName: true,
	description: true,
	targetUrl: true,
	passHostHeader: true,
	environmentId: true,
	serverId: true,
});

export const apiFindOneExternalUpstream = z.object({
	externalUpstreamId: z.string().min(1),
});

export const apiUpdateExternalUpstream = createSchema
	.pick({
		name: true,
		description: true,
		targetUrl: true,
		passHostHeader: true,
	})
	.partial()
	.extend({
		externalUpstreamId: z.string().min(1),
	});

export const apiMoveExternalUpstream = z.object({
	externalUpstreamId: z.string().min(1),
	targetEnvironmentId: z.string().min(1),
});

export const buildExternalUpstreamAppName = (appName?: string) =>
	buildAppName("external-upstream", appName);
