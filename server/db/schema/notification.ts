import { nanoid } from "nanoid";
import { boolean, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";

export const notificationType = pgEnum("notificationType", [
	"slack",
	"telegram",
	"discord",
	"email",
]);

export const notifications = pgTable("notification", {
	notificationId: text("notificationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appDeploy: boolean("appDeploy").notNull().default(false),
	userJoin: boolean("userJoin").notNull().default(false),
	appBuildError: boolean("appBuildError").notNull().default(false),
	databaseBackup: boolean("databaseBackup").notNull().default(false),
	dokployRestart: boolean("dokployRestart").notNull().default(false),
	notificationType: notificationType("notificationType").notNull(),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	slackId: text("slackId").references(() => slack.slackId, {
		onDelete: "cascade",
	}),
	telegramId: text("telegramId").references(() => telegram.telegramId, {
		onDelete: "cascade",
	}),
	discordId: text("discordId").references(() => discord.discordId, {
		onDelete: "cascade",
	}),
	emailId: text("emailId").references(() => email.emailId, {
		onDelete: "cascade",
	}),
});

export const slack = pgTable("slack", {
	slackId: text("slackId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	webhookUrl: text("webhookUrl").notNull(),
	channel: text("channel"),
});

export const telegram = pgTable("telegram", {
	telegramId: text("telegramId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	botToken: text("botToken").notNull(),
	chatId: text("chatId").notNull(),
});

export const discord = pgTable("discord", {
	discordId: text("discordId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	webhookUrl: text("webhookUrl").notNull(),
});

export const email = pgTable("email", {
	emailId: text("emailId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	smtpServer: text("smtpServer").notNull(),
	smtpPort: integer("smtpPort").notNull(),
	username: text("username").notNull(),
	password: text("password").notNull(),
	fromAddress: text("fromAddress").notNull(),
	toAddresses: text("toAddress").array().notNull(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
	slack: one(slack, {
		fields: [notifications.slackId],
		references: [slack.slackId],
	}),
	telegram: one(telegram, {
		fields: [notifications.telegramId],
		references: [telegram.telegramId],
	}),
	discord: one(discord, {
		fields: [notifications.discordId],
		references: [discord.discordId],
	}),
	email: one(email, {
		fields: [notifications.emailId],
		references: [email.emailId],
	}),
}));

export const notificationsSchema = createInsertSchema(notifications);

export const apiCreateSlack = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		userJoin: true,
	})
	.extend({
		webhookUrl: z.string().min(1),
		channel: z.string(),
	})
	.required();

export const apiUpdateSlack = apiCreateSlack.partial().extend({
	notificationId: z.string().min(1),
	slackId: z.string(),
});

export const apiTestSlackConnection = apiCreateSlack.pick({
	webhookUrl: true,
	channel: true,
});

export const apiCreateTelegram = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		userJoin: true,
	})
	.extend({
		botToken: z.string().min(1),
		chatId: z.string().min(1),
	})
	.required();

export const apiUpdateTelegram = apiCreateTelegram.partial().extend({
	notificationId: z.string().min(1),
	telegramId: z.string().min(1),
});

export const apiTestTelegramConnection = apiCreateTelegram.pick({
	botToken: true,
	chatId: true,
});

export const apiCreateDiscord = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		userJoin: true,
	})
	.extend({
		webhookUrl: z.string().min(1),
	})
	.required();

export const apiUpdateDiscord = apiCreateDiscord.partial().extend({
	notificationId: z.string().min(1),
	discordId: z.string().min(1),
});

export const apiTestDiscordConnection = apiCreateDiscord.pick({
	webhookUrl: true,
});

export const apiCreateEmail = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		userJoin: true,
	})
	.extend({
		smtpServer: z.string().min(1),
		smtpPort: z.number().min(1),
		username: z.string().min(1),
		password: z.string().min(1),
		fromAddress: z.string().min(1),
		toAddresses: z.array(z.string()).min(1),
	})
	.required();

export const apiUpdateEmail = apiCreateEmail.partial().extend({
	notificationId: z.string().min(1),
	emailId: z.string().min(1),
});

export const apiTestEmailConnection = apiCreateEmail.pick({
	smtpServer: true,
	smtpPort: true,
	username: true,
	password: true,
	toAddresses: true,
	fromAddress: true,
});

export const apiFindOneNotification = notificationsSchema
	.pick({
		notificationId: true,
	})
	.required();

export const apiSendTest = notificationsSchema
	.extend({
		botToken: z.string(),
		chatId: z.string(),
		webhookUrl: z.string(),
		channel: z.string(),
		smtpServer: z.string(),
		smtpPort: z.number(),
		fromAddress: z.string(),
		username: z.string(),
		password: z.string(),
		toAddresses: z.array(z.string()),
	})
	.partial();
