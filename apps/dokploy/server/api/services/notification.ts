import { db } from "@/server/db";
import {
	type apiCreateDiscord,
	type apiCreateEmail,
	type apiCreateSlack,
	type apiCreateTelegram,
	type apiUpdateDiscord,
	type apiUpdateEmail,
	type apiUpdateSlack,
	type apiUpdateTelegram,
	discord,
	email,
	notifications,
	slack,
	telegram,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type Notification = typeof notifications.$inferSelect;

export const createSlackNotification = async (
	input: typeof apiCreateSlack._type,
) => {
	await db.transaction(async (tx) => {
		const newSlack = await tx
			.insert(slack)
			.values({
				channel: input.channel,
				webhookUrl: input.webhookUrl,
			})
			.returning()
			.then((value) => value[0]);

		if (!newSlack) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting slack",
			});
		}

		const newDestination = await tx
			.insert(notifications)
			.values({
				slackId: newSlack.slackId,
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				notificationType: "slack",
			})
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		return newDestination;
	});
};

export const updateSlackNotification = async (
	input: typeof apiUpdateSlack._type,
) => {
	await db.transaction(async (tx) => {
		const newDestination = await tx
			.update(notifications)
			.set({
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
			})
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(slack)
			.set({
				channel: input.channel,
				webhookUrl: input.webhookUrl,
			})
			.where(eq(slack.slackId, input.slackId))
			.returning()
			.then((value) => value[0]);

		return newDestination;
	});
};

export const createTelegramNotification = async (
	input: typeof apiCreateTelegram._type,
) => {
	await db.transaction(async (tx) => {
		const newTelegram = await tx
			.insert(telegram)
			.values({
				botToken: input.botToken,
				chatId: input.chatId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newTelegram) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting telegram",
			});
		}

		const newDestination = await tx
			.insert(notifications)
			.values({
				telegramId: newTelegram.telegramId,
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				notificationType: "telegram",
			})
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		return newDestination;
	});
};

export const updateTelegramNotification = async (
	input: typeof apiUpdateTelegram._type,
) => {
	await db.transaction(async (tx) => {
		const newDestination = await tx
			.update(notifications)
			.set({
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
			})
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(telegram)
			.set({
				botToken: input.botToken,
				chatId: input.chatId,
			})
			.where(eq(telegram.telegramId, input.telegramId))
			.returning()
			.then((value) => value[0]);

		return newDestination;
	});
};

export const createDiscordNotification = async (
	input: typeof apiCreateDiscord._type,
) => {
	await db.transaction(async (tx) => {
		const newDiscord = await tx
			.insert(discord)
			.values({
				webhookUrl: input.webhookUrl,
			})
			.returning()
			.then((value) => value[0]);

		if (!newDiscord) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting discord",
			});
		}

		const newDestination = await tx
			.insert(notifications)
			.values({
				discordId: newDiscord.discordId,
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				notificationType: "discord",
			})
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		return newDestination;
	});
};

export const updateDiscordNotification = async (
	input: typeof apiUpdateDiscord._type,
) => {
	await db.transaction(async (tx) => {
		const newDestination = await tx
			.update(notifications)
			.set({
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
			})
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(discord)
			.set({
				webhookUrl: input.webhookUrl,
			})
			.where(eq(discord.discordId, input.discordId))
			.returning()
			.then((value) => value[0]);

		return newDestination;
	});
};

export const createEmailNotification = async (
	input: typeof apiCreateEmail._type,
) => {
	await db.transaction(async (tx) => {
		const newEmail = await tx
			.insert(email)
			.values({
				smtpServer: input.smtpServer,
				smtpPort: input.smtpPort,
				username: input.username,
				password: input.password,
				fromAddress: input.fromAddress,
				toAddresses: input.toAddresses,
			})
			.returning()
			.then((value) => value[0]);

		if (!newEmail) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting email",
			});
		}

		const newDestination = await tx
			.insert(notifications)
			.values({
				emailId: newEmail.emailId,
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				notificationType: "email",
			})
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		return newDestination;
	});
};

export const updateEmailNotification = async (
	input: typeof apiUpdateEmail._type,
) => {
	await db.transaction(async (tx) => {
		const newDestination = await tx
			.update(notifications)
			.set({
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
			})
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(email)
			.set({
				smtpServer: input.smtpServer,
				smtpPort: input.smtpPort,
				username: input.username,
				password: input.password,
				fromAddress: input.fromAddress,
				toAddresses: input.toAddresses,
			})
			.where(eq(email.emailId, input.emailId))
			.returning()
			.then((value) => value[0]);

		return newDestination;
	});
};

export const findNotificationById = async (notificationId: string) => {
	const notification = await db.query.notifications.findFirst({
		where: eq(notifications.notificationId, notificationId),
		with: {
			slack: true,
			telegram: true,
			discord: true,
			email: true,
		},
	});
	if (!notification) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Notification not found",
		});
	}
	return notification;
};

export const removeNotificationById = async (notificationId: string) => {
	const result = await db
		.delete(notifications)
		.where(eq(notifications.notificationId, notificationId))
		.returning();

	return result[0];
};

export const updateDestinationById = async (
	notificationId: string,
	notificationData: Partial<Notification>,
) => {
	const result = await db
		.update(notifications)
		.set({
			...notificationData,
		})
		.where(eq(notifications.notificationId, notificationId))
		.returning();

	return result[0];
};
