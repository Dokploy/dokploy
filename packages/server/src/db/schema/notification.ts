import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const notificationType = pgEnum("notificationType", [
	"slack",
	"telegram",
	"discord",
	"email",
	"resend",
	"gotify",
	"ntfy",
	"pushover",
	"custom",
	"lark",
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
	volumeBackup: boolean("volumeBackup").notNull().default(false),
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
	resendId: text("resendId").references(() => resend.resendId, {
		onDelete: "cascade",
	}),
	gotifyId: text("gotifyId").references(() => gotify.gotifyId, {
		onDelete: "cascade",
	}),
	ntfyId: text("ntfyId").references(() => ntfy.ntfyId, {
		onDelete: "cascade",
	}),
	customId: text("customId").references(() => custom.customId, {
		onDelete: "cascade",
	}),
	larkId: text("larkId").references(() => lark.larkId, {
		onDelete: "cascade",
	}),
	pushoverId: text("pushoverId").references(() => pushover.pushoverId, {
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

export const resend = pgTable("resend", {
	resendId: text("resendId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	apiKey: text("apiKey").notNull(),
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

export const ntfy = pgTable("ntfy", {
	ntfyId: text("ntfyId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	serverUrl: text("serverUrl").notNull(),
	topic: text("topic").notNull(),
	accessToken: text("accessToken"),
	priority: integer("priority").notNull().default(3),
});

export const custom = pgTable("custom", {
	customId: text("customId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	endpoint: text("endpoint").notNull(),
	headers: jsonb("headers").$type<Record<string, string>>(),
});

export const lark = pgTable("lark", {
	larkId: text("larkId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	webhookUrl: text("webhookUrl").notNull(),
});

export const pushover = pgTable("pushover", {
	pushoverId: text("pushoverId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	userKey: text("userKey").notNull(),
	apiToken: text("apiToken").notNull(),
	priority: integer("priority").notNull().default(0),
	retry: integer("retry"),
	expire: integer("expire"),
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
	resend: one(resend, {
		fields: [notifications.resendId],
		references: [resend.resendId],
	}),
	gotify: one(gotify, {
		fields: [notifications.gotifyId],
		references: [gotify.gotifyId],
	}),
	ntfy: one(ntfy, {
		fields: [notifications.ntfyId],
		references: [ntfy.ntfyId],
	}),
	custom: one(custom, {
		fields: [notifications.customId],
		references: [custom.customId],
	}),
	lark: one(lark, {
		fields: [notifications.larkId],
		references: [lark.larkId],
	}),
	pushover: one(pushover, {
		fields: [notifications.pushoverId],
		references: [pushover.pushoverId],
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
		volumeBackup: true,
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
		volumeBackup: true,
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
		volumeBackup: true,
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
		volumeBackup: true,
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

export const apiCreateResend = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		volumeBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		dockerCleanup: true,
		serverThreshold: true,
	})
	.extend({
		apiKey: z.string().min(1),
		fromAddress: z.string().min(1),
		toAddresses: z.array(z.string()).min(1),
	})
	.required();

export const apiUpdateResend = apiCreateResend.partial().extend({
	notificationId: z.string().min(1),
	resendId: z.string().min(1),
	organizationId: z.string().optional(),
});

export const apiTestResendConnection = apiCreateResend.pick({
	apiKey: true,
	fromAddress: true,
	toAddresses: true,
});

export const apiCreateGotify = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		volumeBackup: true,
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

export const apiCreateNtfy = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		volumeBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		dockerCleanup: true,
	})
	.extend({
		serverUrl: z.string().min(1),
		topic: z.string().min(1),
		accessToken: z.string().optional(),
		priority: z.number().min(1),
	})
	.required();

export const apiUpdateNtfy = apiCreateNtfy.partial().extend({
	notificationId: z.string().min(1),
	ntfyId: z.string().min(1),
	organizationId: z.string().optional(),
});

export const apiTestNtfyConnection = apiCreateNtfy.pick({
	serverUrl: true,
	topic: true,
	accessToken: true,
	priority: true,
});

export const apiFindOneNotification = notificationsSchema
	.pick({
		notificationId: true,
	})
	.required();

export const apiCreateCustom = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		volumeBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		dockerCleanup: true,
		serverThreshold: true,
	})
	.extend({
		endpoint: z.string().min(1),
		headers: z.record(z.string()).optional(),
	});

export const apiUpdateCustom = apiCreateCustom.partial().extend({
	notificationId: z.string().min(1),
	customId: z.string().min(1),
	organizationId: z.string().optional(),
});

export const apiTestCustomConnection = z.object({
	endpoint: z.string().min(1),
	headers: z.record(z.string()).optional(),
});

export const apiCreateLark = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		volumeBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		dockerCleanup: true,
		serverThreshold: true,
	})
	.extend({
		webhookUrl: z.string().min(1),
	})
	.required();

export const apiUpdateLark = apiCreateLark.partial().extend({
	notificationId: z.string().min(1),
	larkId: z.string().min(1),
	organizationId: z.string().optional(),
});

export const apiTestLarkConnection = apiCreateLark.pick({
	webhookUrl: true,
});

export const apiCreatePushover = notificationsSchema
	.pick({
		appBuildError: true,
		databaseBackup: true,
		volumeBackup: true,
		dokployRestart: true,
		name: true,
		appDeploy: true,
		dockerCleanup: true,
		serverThreshold: true,
	})
	.extend({
		userKey: z.string().min(1),
		apiToken: z.string().min(1),
		priority: z.number().min(-2).max(2).default(0),
		retry: z.number().min(30).nullish(),
		expire: z.number().min(1).max(10800).nullish(),
	})
	.refine(
		(data) =>
			data.priority !== 2 || (data.retry != null && data.expire != null),
		{
			message: "Retry and expire are required for emergency priority (2)",
			path: ["retry"],
		},
	);

export const apiUpdatePushover = z.object({
	notificationId: z.string().min(1),
	pushoverId: z.string().min(1),
	organizationId: z.string().optional(),
	userKey: z.string().min(1).optional(),
	apiToken: z.string().min(1).optional(),
	priority: z.number().min(-2).max(2).optional(),
	retry: z.number().min(30).nullish(),
	expire: z.number().min(1).max(10800).nullish(),
	appBuildError: z.boolean().optional(),
	databaseBackup: z.boolean().optional(),
	volumeBackup: z.boolean().optional(),
	dokployRestart: z.boolean().optional(),
	name: z.string().optional(),
	appDeploy: z.boolean().optional(),
	dockerCleanup: z.boolean().optional(),
	serverThreshold: z.boolean().optional(),
});

export const apiTestPushoverConnection = z
	.object({
		userKey: z.string().min(1),
		apiToken: z.string().min(1),
		priority: z.number().min(-2).max(2),
		retry: z.number().min(30).nullish(),
		expire: z.number().min(1).max(10800).nullish(),
	})
	.refine(
		(data) =>
			data.priority !== 2 || (data.retry != null && data.expire != null),
		{
			message: "Retry and expire are required for emergency priority (2)",
			path: ["retry"],
		},
	);

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
		apiKey: z.string(),
		serverUrl: z.string(),
		topic: z.string(),
		appToken: z.string(),
		accessToken: z.string().optional(),
		priority: z.number(),
		endpoint: z.string(),
		headers: z.string(),
	})
	.partial();
