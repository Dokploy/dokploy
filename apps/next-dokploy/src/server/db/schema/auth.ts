import { relations } from "drizzle-orm";
import { pgTable, pgEnum, text, boolean } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { users } from "./user";
import { admins } from "./admin";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { getRandomValues } from "node:crypto";

const randomImages = [
	"/avatars/avatar-1.png",
	"/avatars/avatar-2.png",
	"/avatars/avatar-3.png",
	"/avatars/avatar-4.png",
	"/avatars/avatar-5.png",
	"/avatars/avatar-6.png",
	"/avatars/avatar-7.png",
	"/avatars/avatar-8.png",
	"/avatars/avatar-9.png",
	"/avatars/avatar-10.png",
	"/avatars/avatar-11.png",
	"/avatars/avatar-12.png",
];

const generateRandomImage = () => {
	return (
		randomImages[
			// @ts-ignore
			getRandomValues(new Uint32Array(1))[0] % randomImages.length
		] || "/avatars/avatar-1.png"
	);
};
export type DatabaseUser = typeof auth.$inferSelect;
export const roles = pgEnum("Roles", ["admin", "user"]);

export const auth = pgTable("auth", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	email: text("email").notNull().unique(),
	password: text("password").notNull(),
	rol: roles("rol").notNull(),
	image: text("image").$defaultFn(() => generateRandomImage()),
	secret: text("secret"),
	token: text("token"),
	is2FAEnabled: boolean("is2FAEnabled").notNull().default(false),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const authRelations = relations(auth, ({ many }) => ({
	admins: many(admins),
	users: many(users),
}));
const createSchema = createInsertSchema(auth, {
	email: z.string().email(),
	password: z.string().min(8),
	rol: z.enum(["admin", "user"]),
	image: z.string().optional(),
});

export const apiCreateAdmin = createSchema.pick({
	email: true,
	password: true,
});

export const apiCreateUser = createSchema
	.pick({
		password: true,
		id: true,
	})
	.required()
	.extend({
		token: z.string().min(1),
	});

export const apiLogin = createSchema
	.pick({
		email: true,
		password: true,
	})
	.required();

export const apiUpdateAuth = createSchema.partial().extend({
	email: z.string().nullable(),
	password: z.string().nullable(),
	image: z.string().optional(),
});

export const apiUpdateAuthByAdmin = createSchema.partial().extend({
	email: z.string().nullable(),
	password: z.string().nullable(),
	image: z.string().optional(),
	id: z.string().min(1),
});

export const apiFindOneAuth = createSchema
	.pick({
		id: true,
	})
	.required();

export const apiVerify2FA = createSchema
	.extend({
		pin: z.string().min(6),
		secret: z.string().min(1),
	})
	.pick({
		pin: true,
		secret: true,
	})
	.required();

export const apiVerifyLogin2FA = createSchema
	.extend({
		pin: z.string().min(6),
	})
	.pick({
		pin: true,
		id: true,
	})
	.required();
