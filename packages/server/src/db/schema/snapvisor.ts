import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

import { SNAPVISOR_DEFAULT_BASE_URL } from "../../utils/snapvisor/urls";

export { SNAPVISOR_DEFAULT_BASE_URL };

/**
 * Organization-scoped Snapvisor connection (one per organization).
 *
 * `accessToken` is a Snapvisor **personal access token**, stored as a
 * plaintext text column like `cloudflare.apiToken`; it is write-only from the
 * dashboard's perspective and every read path masks it. A PAT is required
 * (not a project token): the fork needs to list every project under the
 * account (`GET /v2/accounts/{accountSlug}/projects`, `patOrOAuthAuth` only)
 * as well as read builds for the one project an application is linked to
 * (`GET /v2/projects/{owner}/{project}/builds`, which also accepts a PAT).
 * See services/snapvisor.ts for the cited source files.
 */
export const snapvisorIntegration = pgTable("snapvisor_integration", {
	snapvisorId: text("snapvisorId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	organizationId: text("organizationId")
		.notNull()
		.unique()
		.references(() => organization.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	accessToken: text("accessToken").notNull(),
	accountSlug: text("accountSlug").notNull(),
	baseUrl: text("baseUrl").notNull().default(SNAPVISOR_DEFAULT_BASE_URL),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const snapvisorIntegrationRelations = relations(
	snapvisorIntegration,
	({ one }) => ({
		organization: one(organization, {
			fields: [snapvisorIntegration.organizationId],
			references: [organization.id],
		}),
	}),
);

const snapvisorBaseUrlSchema = z
	.string()
	.trim()
	.url("Enter a valid URL")
	.refine((value) => /^https?:\/\//i.test(value), "Use an http(s) URL")
	.transform((value) => value.replace(/\/+$/, ""));

// Snapvisor account/project slugs are URL path segments.
const snapvisorSlugSchema = z
	.string()
	.trim()
	.min(1)
	.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Use the slug only, not a URL");

export const apiCreateSnapvisor = z.object({
	name: z.string().trim().min(1),
	// Trim before validating so a whitespace-only token cannot pass `.min(1)`.
	accessToken: z.string().trim().min(1),
	accountSlug: snapvisorSlugSchema,
	baseUrl: snapvisorBaseUrlSchema.default(SNAPVISOR_DEFAULT_BASE_URL),
});

export const apiUpdateSnapvisor = z.object({
	name: z.string().trim().min(1).optional(),
	// Write-only: omit it to keep the stored token.
	accessToken: z.string().trim().min(1).optional(),
	accountSlug: snapvisorSlugSchema.optional(),
	baseUrl: snapvisorBaseUrlSchema.optional(),
});

export const apiTestSnapvisorConnection = z.object({
	// Blank on the edit flow: the stored token of the caller's integration is used.
	accessToken: z.string().trim().min(1).optional(),
	baseUrl: snapvisorBaseUrlSchema.default(SNAPVISOR_DEFAULT_BASE_URL),
});

export const apiSetSnapvisorApplicationProject = z.object({
	applicationId: z.string().min(1),
	// `null` turns visual testing off for the application.
	projectName: snapvisorSlugSchema.nullable(),
});

export const apiSnapvisorPreviewBuild = z.object({
	previewDeploymentId: z.string().min(1),
});
