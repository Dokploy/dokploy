import { relations } from "drizzle-orm";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { server } from "./server";
import { certificateType } from "./shared";
import { ssoProvider } from "./sso";

export const forwardAuthSettings = pgTable("forward_auth_settings", {
	forwardAuthSettingsId: text("forwardAuthSettingsId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	authDomain: text("authDomain").notNull(),
	baseDomain: text("baseDomain").notNull(),
	https: boolean("https").notNull().default(true),
	certificateType: certificateType("certificateType")
		.notNull()
		.default("letsencrypt"),
	customCertResolver: text("customCertResolver"),
	providerId: text("providerId").references(() => ssoProvider.providerId, {
		onDelete: "set null",
	}),
	serverId: text("serverId")
		.unique()
		.references(() => server.serverId, {
			onDelete: "cascade",
		}),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const forwardAuthSettingsRelations = relations(
	forwardAuthSettings,
	({ one }) => ({
		server: one(server, {
			fields: [forwardAuthSettings.serverId],
			references: [server.serverId],
		}),
		provider: one(ssoProvider, {
			fields: [forwardAuthSettings.providerId],
			references: [ssoProvider.providerId],
		}),
	}),
);

const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export const apiForwardAuthServerTarget = z.object({
	serverId: z.string().nullable(),
});

export const apiForwardAuthDomainTarget = z.object({
	domainId: z.string().min(1),
});

export const apiSetForwardAuthSettings = z.object({
	serverId: z.string().nullable(),
	authDomain: z
		.string()
		.trim()
		.toLowerCase()
		.refine((v) => domainRegex.test(v), { message: "Invalid auth domain" }),
	https: z.boolean().default(true),
	certificateType: z
		.enum(["none", "letsencrypt", "custom"])
		.default("letsencrypt"),
	customCertResolver: z.string().optional(),
});

export const apiSetPreviewForwardAuth = z.object({
	applicationId: z.string().min(1),
	enabled: z.boolean(),
});

const allowlistEntries = z
	.array(
		z
			.string()
			.trim()
			.min(1)
			.refine((v) => !v.includes(","), {
				message: "Entries can't contain commas",
			}),
	)
	.nullable();

export const apiSetSsoAllowlist = z.object({
	applicationId: z.string().min(1),
	emails: allowlistEntries,
	groups: allowlistEntries,
	emailDomains: allowlistEntries,
});

export const apiDeployForwardAuthOnServer = z.object({
	serverId: z.string().nullable(),
	providerId: z.string().min(1),
});
