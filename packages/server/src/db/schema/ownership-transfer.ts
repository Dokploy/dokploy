import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { user } from "./user";

export const ownershipTransfer = pgTable(
	"ownership_transfer",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		fromUserId: text("from_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		toUserId: text("to_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: text("status")
			.notNull()
			.$type<"pending" | "accepted" | "declined" | "canceled">()
			.default("pending"),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("ownershipTransfer_toUserId_idx").on(table.toUserId)],
);

export const ownershipTransferRelations = relations(
	ownershipTransfer,
	({ one }) => ({
		fromUser: one(user, {
			fields: [ownershipTransfer.fromUserId],
			references: [user.id],
			relationName: "ownershipTransferFrom",
		}),
		toUser: one(user, {
			fields: [ownershipTransfer.toUserId],
			references: [user.id],
			relationName: "ownershipTransferTo",
		}),
	}),
);

export const apiSearchTransferRecipients = z.object({
	query: z.string().max(100),
});

export const apiCheckTransferRecipient = z.object({
	email: z.string().email(),
});

export const apiCreateOwnershipTransfer = apiCheckTransferRecipient.extend({
	password: z.string().min(1),
});

export const apiFindOwnershipTransfer = z.object({
	transferId: z.string().min(1),
});
