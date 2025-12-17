import { relations } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const dnsProviderType = pgEnum("dnsProviderType", [
	"cloudflare",
	"route53",
	"digitalocean",
	"namecheap",
	"gandi",
	"azure",
	"google",
]);

export const dnsProviders = pgTable("dns_provider", {
	dnsProviderId: text("dnsProviderId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	type: dnsProviderType("type").notNull(),
	apiToken: text("apiToken"),
	secretAccessKey: text("secretAccessKey"),
	accessKeyId: text("accessKeyId"),
	region: text("region"),
	ttl: text("ttl").default("1"),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, {
			onDelete: "cascade",
		}),
	active: boolean("active").notNull().default(true),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const dnsProvidersRelations = relations(dnsProviders, ({ one }) => ({
	organization: one(organization, {
		fields: [dnsProviders.organizationId],
		references: [organization.id],
	}),
}));

const createSchema = createInsertSchema(dnsProviders).omit({
	dnsProviderId: true,
	organizationId: true,
	createdAt: true,
}).superRefine((data, ctx) => {
	// Provider-specific validation
	switch (data.type) {
		case "cloudflare":
			if (!data.apiToken) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["apiToken"],
					message: "API token is required for Cloudflare",
				});
			}
			break;
		case "digitalocean":
			if (!data.apiToken) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["apiToken"],
					message: "API token is required for DigitalOcean",
				});
			}
			break;
		case "route53":
			if (!data.accessKeyId) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["accessKeyId"],
					message: "Access key ID is required for Route53",
				});
			}
			if (!data.secretAccessKey) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["secretAccessKey"],
					message: "Secret access key is required for Route53",
				});
			}
			if (!data.region) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["region"],
					message: "Region is required for Route53",
				});
			}
			break;
		case "namecheap":
			if (!data.apiToken) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["apiToken"],
					message: "API user is required for Namecheap",
				});
			}
			break;
	}
});

export const apiCreateDnsProvider = z.object({
	name: z.string().min(1, "Name is required"),
	type: z.enum(["cloudflare", "route53", "digitalocean", "namecheap", "gandi", "azure", "google"]),
	apiToken: z.string().optional(),
	secretAccessKey: z.string().optional(),
	accessKeyId: z.string().optional(),
	region: z.string().optional(),
	ttl: z.string().optional(),
});

export const apiUpdateDnsProvider = apiCreateDnsProvider
	.partial()
	.extend({
		dnsProviderId: z.string(),
	});

export const apiFindOneDnsProvider = z.object({
	dnsProviderId: z.string(),
});

export const dnsProviderValidation = {
	cloudflare: z.object({
		apiToken: z.string().min(1, "API token is required"),
		ttl: z.string().optional(),
	}),
	digitalocean: z.object({
		apiToken: z.string().min(1, "API token is required"),
		ttl: z.string().optional(),
	}),
	route53: z.object({
		accessKeyId: z.string().min(1, "Access key ID is required"),
		secretAccessKey: z.string().min(1, "Secret access key is required"),
		region: z.string().min(1, "Region is required"),
		ttl: z.string().optional(),
	}),
	namecheap: z.object({
		apiToken: z.string().min(1, "API user is required"),
		ttl: z.string().optional(),
	}),
	gandi: z.object({
		apiToken: z.string().min(1, "Personal access token is required"),
		ttl: z.string().optional(),
	}),
	azure: z.object({
		apiToken: z.string().min(1, "Client secret is required"),
		accessKeyId: z.string().min(1, "Client ID is required"),
		region: z.string().min(1, "Tenant ID is required"),
		ttl: z.string().optional(),
	}),
	google: z.object({
		apiToken: z.string().min(1, "Service account key is required"),
		region: z.string().min(1, "Project ID is required"),
		ttl: z.string().optional(),
	}),
};