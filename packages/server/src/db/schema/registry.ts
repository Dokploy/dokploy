import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { applications } from "./application";
/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const registryType = pgEnum("RegistryType", ["selfHosted", "cloud"]);
export const registryAuthType = pgEnum("RegistryAuthType", [
	"credentials",
	"credential-helper",
]);

export const registry = pgTable("registry", {
	registryId: text("registryId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	registryName: text("registryName").notNull(),
	imagePrefix: text("imagePrefix"),
	username: text("username"),
	password: text("password"),
	authType: registryAuthType("authType").notNull().default("credentials"),
	credentialHelper: text("credentialHelper"),
	credentialHelperUrls: text("credentialHelperUrls"),
	registryUrl: text("registryUrl").notNull().default(""),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	registryType: registryType("selfHosted").notNull().default("cloud"),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
});

export const registryRelations = relations(registry, ({ many }) => ({
	applications: many(applications, {
		relationName: "applicationRegistry",
	}),
	buildApplications: many(applications, {
		relationName: "applicationBuildRegistry",
	}),
	rollbackApplications: many(applications, {
		relationName: "applicationRollbackRegistry",
	}),
}));

const createSchema = createInsertSchema(registry, {
	registryName: z.string().min(1),
	username: z.string().nullable().optional(),
	password: z.string().nullable().optional(),
	authType: z.enum(["credentials", "credential-helper"]),
	credentialHelper: z.string().nullable().optional(),
	credentialHelperUrls: z.string().nullable().optional(),
	registryUrl: z.string(),
	organizationId: z.string().min(1),
	registryId: z.string().min(1),
	registryType: z.enum(["cloud"]),
	imagePrefix: z.string().nullable().optional(),
});

function validateRegistryFields(
	data: {
		username?: string | null;
		password?: string | null;
		credentialHelper?: string | null;
		credentialHelperUrls?: string | null;
		registryUrl?: string | null;
	},
	ctx: z.RefinementCtx,
	opts?: { skipPasswordRequired?: boolean },
) {
	const hasCredentials = !!(data.username?.trim() || data.password?.trim());
	const hasCredHelper = !!data.credentialHelper?.trim();

	if (!hasCredentials && !hasCredHelper) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message:
				"At least one authentication method is required (username/password or credential helper)",
			path: ["username"],
		});
		return;
	}

	if (hasCredentials) {
		if (!data.username?.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Username is required",
				path: ["username"],
			});
		}
		if (!opts?.skipPasswordRequired && !data.password?.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Password is required",
				path: ["password"],
			});
		}
	}

	if (hasCredHelper) {
		const urls = data.credentialHelperUrls?.trim();
		if (!urls) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "At least one registry URL is required for credential helpers",
				path: ["credentialHelperUrls"],
			});
		}
	}
}

export const apiCreateRegistry = createSchema
	.pick({})
	.extend({
		registryName: z.string().min(1),
		username: z.string().nullable().optional(),
		password: z.string().nullable().optional(),
		authType: z
			.enum(["credentials", "credential-helper"])
			.default("credentials"),
		credentialHelper: z.string().nullable().optional(),
		credentialHelperUrls: z.string().nullable().optional(),
		registryUrl: z.string(),
		registryType: z.enum(["cloud"]),
		imagePrefix: z.string().nullable().optional(),
		serverId: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		validateRegistryFields(data, ctx);
	});

export const apiTestRegistry = createSchema
	.pick({})
	.extend({
		registryName: z.string().optional(),
		username: z.string().nullable().optional(),
		password: z.string().nullable().optional(),
		authType: z
			.enum(["credentials", "credential-helper"])
			.default("credentials"),
		credentialHelper: z.string().nullable().optional(),
		credentialHelperUrls: z.string().nullable().optional(),
		registryUrl: z.string(),
		registryType: z.enum(["cloud"]),
		imagePrefix: z.string().nullable().optional(),
		serverId: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		validateRegistryFields(data, ctx);
	});

export const apiTestRegistryById = createSchema
	.pick({
		registryId: true,
	})
	.extend({
		serverId: z.string().optional(),
	});

export const apiRemoveRegistry = createSchema
	.pick({
		registryId: true,
	})
	.required();

export const apiFindOneRegistry = createSchema
	.pick({
		registryId: true,
	})
	.required();

export const apiUpdateRegistry = createSchema.partial().extend({
	registryId: z.string().min(1),
	authType: z.enum(["credentials", "credential-helper"]).optional(),
	credentialHelper: z.string().nullable().optional(),
	credentialHelperUrls: z.string().nullable().optional(),
	serverId: z.string().optional(),
});

export const apiEnableSelfHostedRegistry = createSchema
	.pick({
		registryUrl: true,
		username: true,
		password: true,
	})
	.required();
