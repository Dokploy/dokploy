import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

/**
 * Organization-scoped Cloudflare integration credentials.
 *
 * Stores a scoped API token plus the Cloudflare account it belongs to. Mirrors
 * the `destination`/`registry` convention of keeping secrets as plaintext text
 * columns; access is gated to org admins/owners at the router layer.
 */
export const cloudflare = pgTable("cloudflare", {
	cloudflareId: text("cloudflareId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	apiToken: text("apiToken").notNull(),
	accountId: text("accountId").notNull(),
	defaultTunnelId: text("defaultTunnelId"),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const cloudflareRelations = relations(cloudflare, ({ one }) => ({
	organization: one(organization, {
		fields: [cloudflare.organizationId],
		references: [organization.id],
	}),
}));

const createSchema = createInsertSchema(cloudflare, {
	name: z.string().min(1),
	// Trim before validating so a whitespace-only token can't pass `.min(1)`
	// (and, on update, silently overwrite a working token with blanks).
	apiToken: z.string().trim().min(1),
	accountId: z.string().trim().min(1),
	// `nullish` so the optional default can be both omitted (create) and
	// explicitly cleared with `null` (update sets the column back to NULL).
	defaultTunnelId: z.string().nullish(),
});

export const apiCreateCloudflare = createSchema.pick({
	name: true,
	apiToken: true,
	accountId: true,
	defaultTunnelId: true,
});

export const apiFindOneCloudflare = z.object({
	cloudflareId: z.string().min(1),
});

export const apiRemoveCloudflare = z.object({
	cloudflareId: z.string().min(1),
});

export const apiUpdateCloudflare = createSchema
	.pick({
		name: true,
		accountId: true,
		defaultTunnelId: true,
	})
	.extend({
		cloudflareId: z.string().min(1),
		// Token is write-only on update: omit it to keep the stored value.
		apiToken: z.string().trim().min(1).optional(),
	});

export const apiTestCloudflareConnection = z
	.object({
		// Either a freshly-typed token (create flow) or an existing integration to
		// test with its stored token (edit flow — the token is write-only and never
		// sent back to the client). The account id is always validated against
		// whichever token is used, so a corrected id can be tested without re-entry.
		cloudflareId: z.string().min(1).optional(),
		apiToken: z.string().trim().min(1).optional(),
		accountId: z.string().trim().min(1),
	})
	.refine((data) => !!data.apiToken || !!data.cloudflareId, {
		message: "Provide an API token or an existing integration to test",
		path: ["apiToken"],
	});
