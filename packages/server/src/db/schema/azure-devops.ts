import { relations } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { VALID_BRANCH_REGEX } from "../../utils/git-branch-validation";
import { gitProvider } from "./git-provider";
import { encryptedText } from "./utils";

export const azureDevops = pgTable("azure_devops", {
	azureDevopsId: text("azureDevopsId")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	gitProviderId: text("gitProviderId")
		.notNull()
		.references(() => gitProvider.gitProviderId, { onDelete: "cascade" }),
	baseUrl: text("baseUrl").notNull(),
	personalAccessToken: encryptedText("personalAccessToken").notNull(),
});

export const azureDevopsRelations = relations(azureDevops, ({ one }) => ({
	gitProvider: one(gitProvider, {
		fields: [azureDevops.gitProviderId],
		references: [gitProvider.gitProviderId],
	}),
}));

// Deliberately independent of service/provider foreign keys: failed remote
// cleanup must remain actionable after a local deletion.
export const azureDevopsHook = pgTable(
	"azure_devops_hook",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		organizationId: text("organizationId").notNull(),
		serviceId: text("serviceId").notNull(),
		serviceType: text("serviceType", {
			enum: ["application", "compose"],
		}).notNull(),
		azureDevopsId: text("azureDevopsId").notNull(),
		baseUrl: text("baseUrl").notNull(),
		projectId: text("projectId").notNull(),
		subscriptionId: text("subscriptionId"),
		configurationHash: text("configurationHash"),
		status: text("status", {
			enum: ["pending", "active", "disabled", "error", "cleanupPending"],
		})
			.notNull()
			.default("pending"),
		lastSyncedAt: text("lastSyncedAt"),
		error: text("error"),
	},
	(table) => [
		uniqueIndex("azure_devops_hook_service_provider").on(
			table.serviceType,
			table.serviceId,
			table.azureDevopsId,
		),
	],
);

export const apiCreateAzureDevops = z.object({
	name: z.string().trim().min(1),
	baseUrl: z.string().url(),
	personalAccessToken: z
		.string()
		.trim()
		.min(1)
		.max(2048)
		.regex(/^[\x21-\x7e]+$/, "Invalid PAT"),
});
export const apiFindAzureDevops = z.object({
	azureDevopsId: z.string().min(1),
});
export const apiUpdateAzureDevops = apiCreateAzureDevops
	.partial()
	.extend({ azureDevopsId: z.string().min(1) });
export const azureDevopsRepositoryPath = z
	.string()
	.min(1)
	.refine(
		(path) =>
			!/[\0\r\n]/.test(path) &&
			!path.replace(/\\/g, "/").split("/").includes(".."),
		"Path must stay inside the repository",
	);
export const azureDevopsComposePath = azureDevopsRepositoryPath.refine(
	(path) => !/^(?:[/\\]|[a-zA-Z]:)/.test(path),
	"Compose path must be relative to the repository",
);
export const azureDevopsSourceFields = z.object({
	azureDevopsId: z.string().min(1),
	azureDevopsProjectId: z.string().uuid(),
	azureDevopsRepositoryId: z.string().uuid(),
	azureDevopsProjectName: z.string().min(1),
	azureDevopsRepositoryName: z.string().min(1),
	azureDevopsBranch: z
		.string()
		.min(1)
		.regex(VALID_BRANCH_REGEX, "Invalid branch name"),
	watchPaths: z.array(z.string()).nullish(),
	enableSubmodules: z.boolean().optional(),
});
export const apiSaveAzureDevopsProvider = azureDevopsSourceFields.extend({
	applicationId: z.string().min(1),
	azureDevopsBuildPath: azureDevopsRepositoryPath.default("/"),
});
export const apiAzureDevopsService = z.object({
	serviceType: z.enum(["application", "compose"]),
	serviceId: z.string().min(1),
});
