import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

import { user } from "./user";

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
	"free",
	"pro",
	"agency",
]);

export const subscription = pgTable("subscription", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	userId: text("userId")
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: "cascade", onUpdate: "no action" }),
	plan: subscriptionPlanEnum("plan").notNull(),
	status: text("status").notNull(),
	rebillId: text("rebillId"),
	tinkoffCustomerKey: text("tinkoffCustomerKey"),
	currentPeriodEnd: timestamp("currentPeriodEnd"),
	cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const paymentTypeEnum = pgEnum("payment_type", ["subscription", "one_time"]);

export const payment = pgTable("payment", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade", onUpdate: "no action" }),
	tinkoffPaymentId: text("tinkoffPaymentId"),
	orderId: text("orderId").notNull().unique(),
	amount: integer("amount").notNull(),
	currency: text("currency").notNull().default("RUB"),
	type: paymentTypeEnum("type").notNull().default("subscription"),
	subscriptionId: text("subscriptionId").references(() => subscription.id, {
		onDelete: "set null",
		onUpdate: "no action",
	}),
	serviceCode: text("serviceCode"),
	metadata: jsonb("metadata"),
	status: text("status").notNull(),
	description: text("description"),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const subscriptionRelations = relations(subscription, ({ one }) => ({
	user: one(user, { fields: [subscription.userId], references: [user.id] }),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
	user: one(user, { fields: [payment.userId], references: [user.id] }),
	subscription: one(subscription, {
		fields: [payment.subscriptionId],
		references: [subscription.id],
	}),
}));

