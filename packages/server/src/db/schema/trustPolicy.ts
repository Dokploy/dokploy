import { relations } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const trustPolicyMode = pgEnum("TrustPolicyMode", ["keyed", "keyless"]);

export const trustPolicy = pgTable("trustPolicy", {
	trustPolicyId: text("trustPolicyId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	mode: trustPolicyMode("mode").notNull(),
	publicKey: text("publicKey"),
	certificateIdentityRegexp: text("certificateIdentityRegexp"),
	certificateOidcIssuer: text("certificateOidcIssuer"),
	ignoreTlog: boolean("ignoreTlog").notNull().default(false),
	cosignImage: text("cosignImage"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
});

export const trustPolicyRelations = relations(trustPolicy, ({ one }) => ({
	organization: one(organization, {
		fields: [trustPolicy.organizationId],
		references: [organization.id],
	}),
}));

export type TrustPolicy = typeof trustPolicy.$inferSelect;

const createSchema = createInsertSchema(trustPolicy, {
	name: z.string().min(1),
	mode: z.enum(["keyed", "keyless"]),
	publicKey: z.string().nullable().optional(),
	certificateIdentityRegexp: z.string().nullable().optional(),
	certificateOidcIssuer: z.string().nullable().optional(),
	ignoreTlog: z.boolean().optional(),
	cosignImage: z.string().nullable().optional(),
	organizationId: z.string().min(1),
});

// keyed requires a public key; keyless requires identity + issuer.
const refineMode = <T extends z.ZodTypeAny>(schema: T) =>
	schema.superRefine((val: any, ctx) => {
		if (val.mode === "keyed" && !val.publicKey) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Keyed trust policy requires a public key",
				path: ["publicKey"],
			});
		}
		if (
			val.mode === "keyless" &&
			(!val.certificateIdentityRegexp || !val.certificateOidcIssuer)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Keyless trust policy requires certificate identity regexp and OIDC issuer",
				path: ["certificateIdentityRegexp"],
			});
		}
	});

export const apiCreateTrustPolicy = refineMode(
	createSchema
		.pick({
			name: true,
			mode: true,
			publicKey: true,
			certificateIdentityRegexp: true,
			certificateOidcIssuer: true,
			ignoreTlog: true,
			cosignImage: true,
		})
		.required({ name: true, mode: true }),
);

export const apiUpdateTrustPolicy = refineMode(
	createSchema
		.omit({ organizationId: true, createdAt: true })
		.partial()
		.extend({
			trustPolicyId: z.string().min(1),
			mode: z.enum(["keyed", "keyless"]),
		}),
);

export const apiFindOneTrustPolicy = z.object({
	trustPolicyId: z.string().min(1),
});

export const apiRemoveTrustPolicy = z.object({
	trustPolicyId: z.string().min(1),
});
