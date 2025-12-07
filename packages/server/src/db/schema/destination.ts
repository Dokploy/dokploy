import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { backups } from "./backups";

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	provider: text("provider"),
	accessKey: text("accessKey").notNull(),
	secretAccessKey: text("secretAccessKey").notNull(),
	bucket: text("bucket").notNull(),
	region: text("region").notNull(),
	endpoint: text("endpoint").notNull(),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	// Encryption settings (rclone crypt)
	encryptionEnabled: boolean("encryptionEnabled").notNull().default(false),
	encryptionKey: text("encryptionKey"),
	// Optional salt password for additional security (recommended by rclone)
	encryptionPassword2: text("encryptionPassword2"),
	// Filename encryption: "standard" (encrypt), "obfuscate", or "off"
	filenameEncryption: text("filenameEncryption").notNull().default("off"),
	// Whether to encrypt directory names (only applies if filenameEncryption is not "off")
	directoryNameEncryption: boolean("directoryNameEncryption").notNull().default(false),
});

export const destinationsRelations = relations(
	destinations,
	({ many, one }) => ({
		backups: many(backups),
		organization: one(organization, {
			fields: [destinations.organizationId],
			references: [organization.id],
		}),
	}),
);

const createSchema = createInsertSchema(destinations, {
	destinationId: z.string(),
	name: z.string().min(1),
	provider: z.string(),
	accessKey: z.string(),
	bucket: z.string(),
	endpoint: z.string(),
	secretAccessKey: z.string(),
	region: z.string(),
	encryptionEnabled: z.boolean().optional(),
	encryptionKey: z.string().optional(),
	encryptionPassword2: z.string().optional(),
	filenameEncryption: z.enum(["standard", "obfuscate", "off"]).optional(),
	directoryNameEncryption: z.boolean().optional(),
});

export const apiCreateDestination = createSchema
	.pick({
		name: true,
		provider: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		encryptionEnabled: true,
		encryptionKey: true,
		encryptionPassword2: true,
		filenameEncryption: true,
		directoryNameEncryption: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
		encryptionEnabled: z.boolean().optional(),
		encryptionKey: z.string().optional(),
		encryptionPassword2: z.string().optional(),
		filenameEncryption: z.enum(["standard", "obfuscate", "off"]).optional(),
		directoryNameEncryption: z.boolean().optional(),
	});

export const apiFindOneDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

export const apiRemoveDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

export const apiUpdateDestination = createSchema
	.pick({
		name: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		destinationId: true,
		provider: true,
		encryptionEnabled: true,
		encryptionKey: true,
		encryptionPassword2: true,
		filenameEncryption: true,
		directoryNameEncryption: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
		encryptionEnabled: z.boolean().optional(),
		encryptionKey: z.string().optional(),
		encryptionPassword2: z.string().optional(),
		filenameEncryption: z.enum(["standard", "obfuscate", "off"]).optional(),
		directoryNameEncryption: z.boolean().optional(),
	});
