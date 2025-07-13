// import { relations } from "drizzle-orm";
// import { pgTable, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
// import { nanoid } from "nanoid";
// import { organization, member } from "./account";
// import { createInsertSchema } from "drizzle-zod";
// import { z } from "zod";

// export const role = pgTable(
// 	"member_role",
// 	{
// 		roleId: text("roleId")
// 			.primaryKey()
// 			.$defaultFn(() => nanoid()),
// 		name: text("name").notNull().unique(),
// 		description: text("description"),
// 		canDelete: boolean("canDelete").notNull().default(true),
// 		isSystem: boolean("is_system").default(false),
// 		permissions: text("permissions").array(),
// 		createdAt: timestamp("created_at").notNull().defaultNow(),
// 		updatedAt: timestamp("updated_at").notNull().defaultNow(),
// 		organizationId: text("organizationId")
// 			.notNull()
// 			.references(() => organization.id, { onDelete: "cascade" }),
// 	},
// 	(table) => ({
// 		roleName: unique("role_name_unique").on(table.name, table.organizationId),
// 	}),
// );

// export const roleRelations = relations(role, ({ one, many }) => ({
// 	organization: one(organization, {
// 		fields: [role.organizationId],
// 		references: [organization.id],
// 	}),
// 	members: many(member),
// }));

// export type Role = typeof role.$inferSelect;

// export const createRoleSchema = createInsertSchema(role)
// 	.omit({
// 		roleId: true,
// 		createdAt: true,
// 		updatedAt: true,
// 		isSystem: true,
// 		organizationId: true,
// 	})
// 	.extend({
// 		permissions: z.array(z.string()),
// 	});

// export const updateRoleSchema = createRoleSchema.extend({
// 	roleId: z.string().min(1),
// });

// export const apiFindOneRole = z.object({
// 	roleId: z.string().min(1),
// });
