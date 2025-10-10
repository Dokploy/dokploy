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
	applications: many(applications),
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
	.required()
	.extend({
		serverId: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.registryType === "awsEcr") {
			const { awsAccessKeyId, awsSecretAccessKey, awsRegion, registryUrl } =
				data;
			if (!isNonEmptyString(registryUrl)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Registry URL is required",
					path: ["registryUrl"],
				});
			}
			if (!isNonEmptyString(awsAccessKeyId)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "AWS Access Key ID is required",
					path: ["awsAccessKeyId"],
				});
			}
			if (!isNonEmptyString(awsSecretAccessKey)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "AWS Secret Access Key is required",
					path: ["awsSecretAccessKey"],
				});
			}
			if (!isNonEmptyString(awsRegion)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "AWS Region is required",
					path: ["awsRegion"],
				});
			}
		} else {
			// For regular registries, require username and password
			if (!isNonEmptyString(data.username)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Username is required",
					path: ["username"],
				});
			}
			if (!isNonEmptyString(data.password)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
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
				code: z.ZodIssueCode.custom,
				message: "Registry URL is required",
				path: ["registryUrl"],
			});
		}
		if (!isNonEmptyString(awsAccessKeyId)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "AWS Access Key ID is required",
				path: ["awsAccessKeyId"],
			});
		}
		if (!isNonEmptyString(awsSecretAccessKey)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "AWS Secret Access Key is required",
				path: ["awsSecretAccessKey"],
			});
		}
		if (!isNonEmptyString(awsRegion)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "AWS Region is required",
				path: ["awsRegion"],
			});
		}
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
	serverId: z.string().optional(),
});

export const apiEnableSelfHostedRegistry = createSchema
	.pick({
		registryUrl: true,
		username: true,
		password: true,
	})
	.required();

interface RegistryLoginData {
	registryType: "cloud" | "awsEcr" | "selfHosted";
	registryUrl?: string | null;
	username?: string | null;
	password?: string | null;
	awsAccessKeyId?: string | null;
	awsSecretAccessKey?: string | null;
	awsRegion?: string | null;
}

export const getSafeECRLoginCommand = (data: RegistryLoginData): string => {
	const { registryUrl, awsRegion, awsAccessKeyId, awsSecretAccessKey } = data;
	const escapedRegistry = shEscape(registryUrl);
	const escapedRegion = shEscape(awsRegion);
	const escapedAccessKeyId = shEscape(awsAccessKeyId);
	const escapedSecretAccessKey = shEscape(awsSecretAccessKey);

	return `AWS_ACCESS_KEY_ID=${escapedAccessKeyId} AWS_SECRET_ACCESS_KEY=${escapedSecretAccessKey} aws ecr get-login-password --region ${escapedRegion} | docker login --username AWS --password-stdin ${escapedRegistry}`;
};

export const getSafeDockerLoginCommand = (data: RegistryLoginData): string => {
	const { registryUrl, username, password } = data;
	const escapedRegistry = shEscape(registryUrl);
	const escapedUser = shEscape(username);
	const escapedPassword = shEscape(password);

	return `printf %s ${escapedPassword} | docker login ${escapedRegistry} -u ${escapedUser} --password-stdin`;
};

export const getSafeRegistryLoginCommand = (
	data: RegistryLoginData,
): string => {
	if (data.registryType === "awsEcr") {
		// AWS ECR login command using AWS CLI
		return getSafeECRLoginCommand(data);
	}
	// Generic Docker registry login (for "cloud" and "selfHosted" types)
	return getSafeDockerLoginCommand(data);
};

export const executeECRLogin = async (
	input: {
		registryUrl?: string;
		awsAccessKeyId?: string;
		awsSecretAccessKey?: string;
		awsRegion?: string;
		serverId?: string;
	},
	execAsync: (command: string) => Promise<any>,
	execAsyncRemote: (serverId: string, command: string) => Promise<any>,
) => {
	const loginCommand = getSafeECRLoginCommand({
		registryType: "awsEcr",
		registryUrl: input.registryUrl,
		awsAccessKeyId: input.awsAccessKeyId,
		awsSecretAccessKey: input.awsSecretAccessKey,
		awsRegion: input.awsRegion,
	});

	if (input.serverId && input.serverId !== "none") {
		await execAsyncRemote(input.serverId, loginCommand);
	} else {
		await execAsync(loginCommand);
	}
};
