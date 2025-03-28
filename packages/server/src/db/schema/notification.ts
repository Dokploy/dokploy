import { relations } from "drizzle-orm";
import { boolean, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const notificationType = pgEnum("notificationType", [
	"slack",
	"telegram",
	"discord",
	"email",
	"gotify",
]);

export const notifications = pgTable("notification", {
	notificationId: text("notificationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appDeploy: boolean("appDeploy").notNull().default(false),
	appBuildError: boolean("appBuildError").notNull().default(false),
	databaseBackup: boolean("databaseBackup").notNull().default(false),
	dokployRestart: boolean("dokployRestart").notNull().default(false),
	dockerCleanup: boolean("dockerCleanup").notNull().default(false),
	serverThreshold: boolean("serverThreshold").notNull().default(false),
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
	gotifyId: text("gotifyId").references(() => gotify.gotifyId, {
		onDelete: "cascade",
	}),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
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
	messageThreadId: text("messageThreadId"),
});

export const discord = pgTable("discord", {
	discordId: text("discordId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	webhookUrl: text("webhookUrl").notNull(),
	decoration: boolean("decoration"),
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

export const gotify = pgTable("gotify", {
	gotifyId: text("gotifyId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	serverUrl: text("serverUrl").notNull(),
	appToken: text("appToken").notNull(),
	priority: integer("priority").notNull().default(5),
	decoration: boolean("decoration"),
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
	gotify: one(gotify, {
		fields: [notifications.gotifyId],
		references: [gotify.gotifyId],
	}),
	organization: one(organization, {
		fields: [notifications.organizationId],
		references: [organization.id],
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
		dockerCleanup: true,
		serverThreshold: true,
	})
	.extend({
		webhookUrl: z.string().min(1),
		channel: z.string(),
	})
	.required();

export const apiUpdateSlack = apiCreateSlack.partial().extend({
	notificationId: z.string().min(1),
	slackId: z.string(),
	organizationId: z.string().optional(),
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
		dockerCleanup: true,
		serverThreshold: true,
	})
	.extend({
		botToken: z.string().min(1),
		chatId: z.string().min(1),
		messageThreadId: z.string(),
	})
	.required();

export const apiUpdateTelegram = apiCreateTelegram.partial().extend({
	notificationId: z.string().min(1),
	telegramId: z.string().min(1),
	organizationId: z.string().optional(),
});

export const apiTestTelegramConnection = apiCreateTelegram.pick({
	botToken: true,
	chatId: true,
	messageThreadId: true,
});

export const apiCreateDiscord = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		dockerCleanup: true,
		serverThreshold: true,
	})
	.extend({
		webhookUrl: z.string().min(1),
		decoration: z.boolean(),
	})
	.required();

export const apiUpdateDiscord = apiCreateDiscord.partial().extend({
	notificationId: z.string().min(1),
	discordId: z.string().min(1),
	organizationId: z.string().optional(),
});

export const apiTestDiscordConnection = apiCreateDiscord
	.pick({
		webhookUrl: true,
	})
	.extend({
		decoration: z.boolean().optional(),
	});

export const apiCreateEmail = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		dockerCleanup: true,
		serverThreshold: true,
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
	organizationId: z.string().optional(),
});

export const apiTestEmailConnection = apiCreateEmail.pick({
	smtpServer: true,
	smtpPort: true,
	username: true,
	password: true,
	toAddresses: true,
	fromAddress: true,
});

export const apiCreateGotify = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		dockerCleanup: true,
	})
	.extend({
		serverUrl: z.string().min(1),
		appToken: z.string().min(1),
		priority: z.number().min(1),
		decoration: z.boolean(),
	})
	.required();

export const apiUpdateGotify = apiCreateGotify.partial().extend({
	notificationId: z.string().min(1),
	gotifyId: z.string().min(1),
	organizationId: z.string().optional(),
});

export const apiTestGotifyConnection = apiCreateGotify
	.pick({
		serverUrl: true,
		appToken: true,
		priority: true,
	})
	.extend({
		decoration: z.boolean().optional(),
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
		serverUrl: z.string(),
		appToken: z.string(),
		priority: z.number(),
	})
	.partial();
