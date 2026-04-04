import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { applications } from "./application";
import { isNonEmptyString, shEscape } from "./utils";
/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const registryType = pgEnum("RegistryType", [
	"selfHosted",
	"cloud",
	"awsEcr",
]);

export const registry = pgTable("registry", {
	registryId: text("registryId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	registryName: text("registryName").notNull(),
	imagePrefix: text("imagePrefix"),
	username: text("username").notNull(),
	password: text("password").notNull(),
	registryUrl: text("registryUrl").notNull().default(""),
	// AWS ECR specific fields
	awsAccessKeyId: text("awsAccessKeyId"),
	awsSecretAccessKey: text("awsSecretAccessKey"),
	awsRegion: text("awsRegion"),
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
	username: z.string().min(1),
	password: z.string().min(1),
	registryUrl: z.string(),
	organizationId: z.string().min(1),
	registryId: z.string().min(1),
	registryType: z.enum(["cloud", "awsEcr"]),
	imagePrefix: z.string().nullable().optional(),
});

export const apiCreateRegistry = createSchema
	.pick({})
	.extend({
		registryName: z.string().min(1),
		username: z.string().optional(),
		password: z.string().optional(),
		registryUrl: z.string(),
		registryType: z.enum(["cloud", "awsEcr"]),
		imagePrefix: z.string().nullable().optional(),
		// AWS ECR specific fields (conditional based on registryType)
		awsAccessKeyId: z.string().optional(),
		awsSecretAccessKey: z.string().optional(),
		awsRegion: z.string().optional(),
	})
	.required({ registryName: true, registryUrl: true, registryType: true })
	.extend({
		username: z.string().optional(),
		password: z.string().optional(),
		awsAccessKeyId: z.string().optional(),
		awsSecretAccessKey: z.string().optional(),
		awsRegion: z.string().optional(),
		imagePrefix: z.string().nullable().optional(),
		serverId: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.registryType === "awsEcr") {
			const { awsAccessKeyId, awsSecretAccessKey, awsRegion, registryUrl } =
				data;
			if (!isNonEmptyString(registryUrl)) {
				ctx.addIssue({
					code: "custom",
					message: "Registry URL is required",
					path: ["registryUrl"],
				});
			}
			if (!isNonEmptyString(awsAccessKeyId)) {
				ctx.addIssue({
					code: "custom",
					message: "AWS Access Key ID is required",
					path: ["awsAccessKeyId"],
				});
			}
			if (!isNonEmptyString(awsSecretAccessKey)) {
				ctx.addIssue({
					code: "custom",
					message: "AWS Secret Access Key is required",
					path: ["awsSecretAccessKey"],
				});
			}
			if (!isNonEmptyString(awsRegion)) {
				ctx.addIssue({
					code: "custom",
					message: "AWS Region is required",
					path: ["awsRegion"],
				});
			}
		} else {
			// For regular registries, require username and password
			if (!isNonEmptyString(data.username)) {
				ctx.addIssue({
					code: "custom",
					message: "Username is required",
					path: ["username"],
				});
			}
			if (!isNonEmptyString(data.password)) {
				ctx.addIssue({
					code: "custom",
					message: "Password is required",
					path: ["password"],
				});
			}
		}
	});

export const apiTestRegistry = createSchema
	.pick({})
	.extend({
		registryName: z.string().optional(),
		username: z.string().optional(),
		password: z.string().optional(),
		registryUrl: z.string(),
		registryType: z.enum(["cloud", "awsEcr"]),
		imagePrefix: z.string().nullable().optional(),
		serverId: z.string().optional(),
		// AWS ECR specific fields
		awsAccessKeyId: z.string().optional(),
		awsSecretAccessKey: z.string().optional(),
		awsRegion: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.registryType !== "awsEcr") {
			return;
		}
		const { awsAccessKeyId, awsSecretAccessKey, awsRegion, registryUrl } = data;
		if (!isNonEmptyString(registryUrl)) {
			ctx.addIssue({
				code: "custom",
				message: "Registry URL is required",
				path: ["registryUrl"],
			});
		}
		if (!isNonEmptyString(awsAccessKeyId)) {
			ctx.addIssue({
				code: "custom",
				message: "AWS Access Key ID is required",
				path: ["awsAccessKeyId"],
			});
		}
		if (!isNonEmptyString(awsSecretAccessKey)) {
			ctx.addIssue({
				code: "custom",
				message: "AWS Secret Access Key is required",
				path: ["awsSecretAccessKey"],
			});
		}
		if (!isNonEmptyString(awsRegion)) {
			ctx.addIssue({
				code: "custom",
				message: "AWS Region is required",
				path: ["awsRegion"],
			});
		}
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

export const apiFindOneRegistry = z.object({
	registryId: z.string().min(1),
});

export const apiUpdateRegistry = createSchema.partial().extend({
	registryId: z.string().min(1),
	serverId: z.string().optional(),
});

export const apiEnableSelfHostedRegistry = createSchema
	.pick({
		registryUrl: true,
		username: true,
		password: true,
	})
	.required();

export interface RegistryLoginData {
	registryType: "cloud" | "awsEcr" | "selfHosted";
	registryUrl?: string | null;
	username?: string | null;
	password?: string | null;
	/**
	 * Pre-fetched ECR auth token (from getECRAuthToken). Required when
	 * registryType is "awsEcr" and building a shell login command.
	 */
	ecrAuthPassword?: string | null;
}

export const getSafeDockerLoginCommand = (data: RegistryLoginData): string => {
	const { registryUrl, username, password } = data;
	const escapedRegistry = shEscape(registryUrl);
	const escapedUser = shEscape(username);
	const escapedPassword = shEscape(password);

	return `printf %s ${escapedPassword} | docker login ${escapedRegistry} -u ${escapedUser} --password-stdin`;
};

/**
 * Returns a safe shell command to log Docker into a registry.
 * For ECR registries, expects `ecrAuthPassword` (fetched via getECRAuthToken)
 * rather than raw AWS credentials — the SDK handles token acquisition.
 */
export const getSafeRegistryLoginCommand = (
	data: RegistryLoginData,
): string => {
	if (data.registryType === "awsEcr") {
		const escapedPassword = shEscape(data.ecrAuthPassword);
		const escapedRegistry = shEscape(data.registryUrl);
		return `printf %s ${escapedPassword} | docker login --username AWS --password-stdin ${escapedRegistry}`;
	}
	return getSafeDockerLoginCommand(data);
};
