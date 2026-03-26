import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

import { user } from "./user";

export const subscription = pgTable("subscription", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	userId: text("userId").notNull().unique(),
	plan: text("plan").notNull(),
	status: text("status").notNull(),
	rebillId: text("rebillId"),
	tinkoffCustomerKey: text("tinkoffCustomerKey"),
	currentPeriodEnd: timestamp("currentPeriodEnd"),
	cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const payment = pgTable("payment", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	userId: text("userId").notNull(),
	tinkoffPaymentId: text("tinkoffPaymentId"),
	orderId: text("orderId").notNull().unique(),
	amount: integer("amount").notNull(),
	currency: text("currency").notNull().default("RUB"),
	status: text("status").notNull(),
	description: text("description"),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const subscriptionRelations = relations(subscription, ({ one }) => ({
	user: one(user, { fields: [subscription.userId], references: [user.id] }),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
	user: one(user, { fields: [payment.userId], references: [user.id] }),
}));

