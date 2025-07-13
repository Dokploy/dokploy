import { boolean, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { certificateType } from "./shared";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";

export const webServer = pgTable("web_server", {
	webServerId: text("webServerId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	// Admin
	serverIp: text("serverIp"),
	certificateType: certificateType("certificateType").notNull().default("none"),
	https: boolean("https").notNull().default(false),
	host: text("host"),
	letsEncryptEmail: text("letsEncryptEmail"),
	sshPrivateKey: text("sshPrivateKey"),
	enableDockerCleanup: boolean("enableDockerCleanup").notNull().default(false),
	logCleanupCron: text("logCleanupCron").default("0 0 * * *"),
	metricsConfig: jsonb("metricsConfig")
		.$type<{
			server: {
				type: "Dokploy" | "Remote";
				refreshRate: number;
				port: number;
				token: string;
				urlCallback: string;
				retentionDays: number;
				cronJob: string;
				thresholds: {
					cpu: number;
					memory: number;
				};
			};
			containers: {
				refreshRate: number;
				services: {
					include: string[];
					exclude: string[];
				};
			};
		}>()
		.notNull()
		.default({
			server: {
				type: "Dokploy",
				refreshRate: 60,
				port: 4500,
				token: "",
				retentionDays: 2,
				cronJob: "",
				urlCallback: "",
				thresholds: {
					cpu: 0,
					memory: 0,
				},
			},
			containers: {
				refreshRate: 60,
				services: {
					include: [],
					exclude: [],
				},
			},
		}),
});

export type WebServer = typeof webServer.$inferSelect;

const createSchema = createInsertSchema(webServer);

export const updateWebServerSchema = createSchema.omit({
	webServerId: true,
	metricsConfig: true,
});

export const apiSaveSSHKey = createSchema
	.pick({
		sshPrivateKey: true,
	})
	.required();

export const apiAssignDomain = createSchema
	.pick({
		host: true,
		certificateType: true,
		letsEncryptEmail: true,
		https: true,
	})
	.required()
	.partial({
		letsEncryptEmail: true,
		https: true,
	});

export const apiUpdateDockerCleanup = createSchema
	.pick({
		enableDockerCleanup: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});
