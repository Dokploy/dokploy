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
	"ntfy",
	"teams",
	"lark",
]);

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
	toAddresses: text("toAddresses").array().notNull(),
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

export const ntfy = pgTable("ntfy", {
	ntfyId: text("ntfyId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	serverUrl: text("serverUrl").notNull(),
	topic: text("topic").notNull(),
	accessToken: text("accessToken").notNull(),
	priority: integer("priority").notNull().default(3),
});

export const teams = pgTable("teams", {
	teamsId: text("teamsId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	webhookUrl: text("webhookUrl").notNull(),
	decoration: boolean("decoration"),
});

export const lark = pgTable("lark", {
	larkId: text("larkId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	webhookUrl: text("webhookUrl").notNull(),
});

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
	ntfyId: text("ntfyId").references(() => ntfy.ntfyId, {
		onDelete: "cascade",
	}),
	teamsId: text("teamsId").references(() => teams.teamsId, {
		onDelete: "cascade",
	}),
	larkId: text("larkId").references(() => lark.larkId, {
		onDelete: "cascade",
	}),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
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
	ntfy: one(ntfy, {
		fields: [notifications.ntfyId],
		references: [ntfy.ntfyId],
	}),
	teams: one(teams, {
		fields: [notifications.teamsId],
		references: [teams.teamsId],
	}),
	lark: one(lark, {
		fields: [notifications.larkId],
		references: [lark.larkId],
	}),
	organization: one(organization, {
		fields: [notifications.organizationId],
		references: [organization.id],
	}),
}));

export const notificationsSchema = createInsertSchema(notifications);

export const apiFindOneNotification = notificationsSchema
	.pick({
		notificationId: true,
	})
	.required();

export const apiCreateLark = notificationsSchema
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
		webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
	});

export const apiUpdateLark = apiCreateLark
	.extend({
		notificationId: z
			.string()
			.min(1, { message: "Notification ID is required" }),
		larkId: z.string().min(1, { message: "Lark ID is required" }),
		organizationId: z
			.string()
			.min(1, { message: "Organization ID is required" }),
	})
	.partial();

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
		webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
		channel: z.string().optional(),
	});

export const apiUpdateSlack = apiCreateSlack
	.extend({
		notificationId: z
			.string()
			.min(1, { message: "Notification ID is required" }),
		slackId: z.string().min(1, { message: "Slack ID is required" }),
		organizationId: z
			.string()
			.min(1, { message: "Organization ID is required" }),
	})
	.partial();

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
		botToken: z.string().min(1, { message: "Bot Token is required" }),
		chatId: z.string().min(1, { message: "Chat ID is required" }),
		messageThreadId: z.string().optional(),
	});

export const apiUpdateTelegram = apiCreateTelegram
	.extend({
		notificationId: z
			.string()
			.min(1, { message: "Notification ID is required" }),
		telegramId: z.string().min(1, { message: "Telegram ID is required" }),
		organizationId: z
			.string()
			.min(1, { message: "Organization ID is required" }),
	})
	.partial();

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
		webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
		decoration: z.boolean().optional(),
	});

export const apiUpdateDiscord = apiCreateDiscord
	.extend({
		notificationId: z
			.string()
			.min(1, { message: "Notification ID is required" }),
		discordId: z.string().min(1, { message: "Discord ID is required" }),
		organizationId: z
			.string()
			.min(1, { message: "Organization ID is required" }),
	})
	.partial();

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
		smtpServer: z.string().min(1, { message: "SMTP Server is required" }),
		smtpPort: z.number().min(1, { message: "SMTP Port is required" }),
		username: z.string().min(1, { message: "Username is required" }),
		password: z.string().min(1, { message: "Password is required" }),
		fromAddress: z.string().min(1, { message: "From Address is required" }),
		toAddresses: z.array(z.string().email()).min(1),
	});

export const apiUpdateEmail = apiCreateEmail
	.extend({
		notificationId: z
			.string()
			.min(1, { message: "Notification ID is required" }),
		emailId: z.string().min(1, { message: "Email ID is required" }),
		organizationId: z
			.string()
			.min(1, { message: "Organization ID is required" }),
	})
	.partial();

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
		serverUrl: z.string().min(1, { message: "Server URL is required" }),
		appToken: z.string().min(1, { message: "App Token is required" }),
		priority: z.number().min(1).max(10).default(5),
		decoration: z.boolean().optional(),
	});

export const apiUpdateGotify = apiCreateGotify
	.extend({
		notificationId: z
			.string()
			.min(1, { message: "Notification ID is required" }),
		gotifyId: z.string().min(1, { message: "Gotify ID is required" }),
		organizationId: z
			.string()
			.min(1, { message: "Organization ID is required" }),
	})
	.partial();

export const apiCreateNtfy = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		dockerCleanup: true,
	})
	.extend({
		serverUrl: z.string().min(1, { message: "Server URL is required" }),
		topic: z.string().min(1, { message: "Topic is required" }),
		accessToken: z.string().min(1, { message: "Access Token is required" }),
		priority: z.number().min(1).max(5).default(3),
	});

export const apiUpdateNtfy = apiCreateNtfy
	.extend({
		notificationId: z
			.string()
			.min(1, { message: "Notification ID is required" }),
		ntfyId: z.string().min(1, { message: "Ntfy ID is required" }),
		organizationId: z
			.string()
			.min(1, { message: "Organization ID is required" }),
	})
	.partial();

export const apiCreateTeams = notificationsSchema
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
		webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
		decoration: z.boolean().optional(),
	});

export const apiUpdateTeams = apiCreateTeams
	.extend({
		notificationId: z
			.string()
			.min(1, { message: "Notification ID is required" }),
		teamsId: z.string().min(1, { message: "Teams ID is required" }),
		organizationId: z
			.string()
			.min(1, { message: "Organization ID is required" }),
	})
	.partial();

export const apiSendTest = notificationsSchema
	.extend({
		webhookUrl: z.string().optional(),
		channel: z.string().optional(),
		botToken: z.string().optional(),
		chatId: z.string().optional(),
		messageThreadId: z.string().optional(),
		decoration: z.boolean().optional(),
		smtpServer: z.string().optional(),
		smtpPort: z.number().optional(),
		username: z.string().optional(),
		password: z.string().optional(),
		fromAddress: z.string().optional(),
		toAddresses: z.array(z.string().email()).optional(),
		serverUrl: z.string().optional(),
		appToken: z.string().optional(),
		topic: z.string().optional(),
		accessToken: z.string().optional(),
		priority: z.number().optional(),
	})
	.partial();

// API Test Connection Schemas
export const apiTestSlackConnection = z.object({
	webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
	channel: z.string().optional(),
	decoration: z.boolean().optional(),
});

export const apiTestTelegramConnection = z.object({
	botToken: z.string().min(1, { message: "Bot token is required" }),
	chatId: z.string().min(1, { message: "Chat ID is required" }),
	messageThreadId: z.string().optional(),
});

export const apiTestDiscordConnection = z.object({
	webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
	decoration: z.boolean().optional(),
});

export const apiTestEmailConnection = z.object({
	smtpServer: z.string().min(1, { message: "SMTP server is required" }),
	smtpPort: z.number().min(1, { message: "SMTP port is required" }),
	username: z.string().min(1, { message: "Username is required" }),
	password: z.string().min(1, { message: "Password is required" }),
	fromAddress: z.string().email({ message: "Valid email address is required" }),
	toAddresses: z
		.array(z.string().email())
		.min(1, { message: "At least one recipient is required" }),
});

export const apiTestGotifyConnection = z.object({
	serverUrl: z.string().min(1, { message: "Server URL is required" }),
	appToken: z.string().min(1, { message: "App token is required" }),
	decoration: z.boolean().optional(),
	priority: z.number().optional(),
});

export const apiTestNtfyConnection = z.object({
	serverUrl: z.string().min(1, { message: "Server URL is required" }),
	topic: z.string().min(1, { message: "Topic is required" }),
	accessToken: z.string().min(1, { message: "Access token is required" }),
	priority: z.number().optional(),
});

export const apiTestTeamsConnection = z.object({
	webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
	decoration: z.boolean().optional(),
});

export const apiTestLarkConnection = z.object({
	webhookUrl: z.string().min(1, { message: "Webhook URL is required" }),
});
