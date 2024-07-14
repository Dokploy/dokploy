import { db } from "@/server/db";
import {
	type apiCreateDiscord,
	type apiCreateEmail,
	type apiCreateSlack,
	type apiCreateTelegram,
	type apiTestDiscordConnection,
	type apiTestEmailConnection,
	type apiTestSlackConnection,
	type apiTestTelegramConnection,
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
import { render } from "@react-email/components";
import { TRPCError } from "@trpc/server";
import nodemailer from "nodemailer";
import { and, eq, isNotNull } from "drizzle-orm";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { BuildFailedEmail } from "@/emails/emails/build-failed";

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
				userJoin: input.userJoin,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
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
				userJoin: input.userJoin,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
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
				userJoin: input.userJoin,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
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
				userJoin: input.userJoin,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
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
				userJoin: input.userJoin,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
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
				userJoin: input.userJoin,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
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
				userJoin: input.userJoin,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
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
				userJoin: input.userJoin,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
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

export const sendSlackTestNotification = async (
	slackTestConnection: typeof apiTestSlackConnection._type,
) => {
	const { webhookUrl, channel } = slackTestConnection;

	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ text: "Hi, From Dokploy 👋", channel }),
	});

	if (!response.ok) {
		throw new Error("Error to send test notification");
	}
};

export const sendTelegramTestNotification = async (
	telegramTestConnection: typeof apiTestTelegramConnection._type,
) => {
	const { botToken, chatId } = telegramTestConnection;
	const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			chat_id: chatId,
			text: "Hi, From Dokploy 👋",
		}),
	});

	if (!response.ok) {
		throw new Error("Error to send test notification");
	}
};

export const sendDiscordTestNotification = async (
	discordTestConnection: typeof apiTestDiscordConnection._type,
) => {
	const { webhookUrl } = discordTestConnection;
	// go to your discord server
	// go to settings
	// go to integrations
	// add a new integration
	// select webhook
	// copy the webhook url
	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			content: "Hi, From Dokploy 👋",
		}),
	});

	if (!response.ok) {
		throw new Error("Error to send test notification");
	}
};

export const sendEmailTestNotification = async (
	emailTestConnection: typeof apiTestEmailConnection._type,
) => {
	const { smtpServer, smtpPort, username, password, toAddresses, fromAddress } =
		emailTestConnection;
	const transporter = nodemailer.createTransport({
		host: smtpServer,
		port: smtpPort,
		secure: smtpPort === 465,
		auth: {
			user: username,
			pass: password,
		},
	} as SMTPTransport.Options);
	// need to add a valid from address
	const mailOptions = {
		from: fromAddress,
		to: toAddresses?.join(", "),
		subject: "Test email",
		text: "Hi, From Dokploy 👋",
	};

	await transporter.sendMail(mailOptions);

	console.log("Email notification sent successfully");
};

// export const sendInvitationEmail = async (
// 	emailTestConnection: typeof apiTestEmailConnection._type,
// 	inviteLink: string,
// 	toEmail: string,
// ) => {
// 	const { smtpServer, smtpPort, username, password, fromAddress } =
// 		emailTestConnection;
// 	const transporter = nodemailer.createTransport({
// 		host: smtpServer,
// 		port: smtpPort,
// 		secure: smtpPort === 465,
// 		auth: {
// 			user: username,
// 			pass: password,
// 		},
// 	} as SMTPTransport.Options);
// 	// need to add a valid from address
// 	const mailOptions = {
// 		from: fromAddress,
// 		to: toEmail,
// 		subject: "Invitation to join Dokploy",
// 		html: InvitationTemplate({
// 			inviteLink: inviteLink,
// 			toEmail: toEmail,
// 		}),
// 	};

// 	await transporter.sendMail(mailOptions);

// 	console.log("Email notification sent successfully");
// };

export const sendBuildFailedEmail = async ({
	projectName,
	applicationName,
	applicationType,
	errorMessage,
	buildLink,
}: {
	projectName: string;
	applicationName: string;
	applicationType: string;
	errorMessage: string;
	buildLink: string;
}) => {
	const notificationList = await db.query.notifications.findMany({
		where: and(
			isNotNull(notifications.emailId),
			eq(notifications.appBuildError, true),
		),
		with: {
			email: true,
		},
	});

	for (const notification of notificationList) {
		const { email } = notification;
		if (email) {
			const {
				smtpServer,
				smtpPort,
				username,
				password,
				fromAddress,
				toAddresses,
			} = email;
			const transporter = nodemailer.createTransport({
				host: smtpServer,
				port: smtpPort,
				secure: smtpPort === 465,
				auth: {
					user: username,
					pass: password,
				},
			} as SMTPTransport.Options);
			const mailOptions = {
				from: fromAddress,
				to: toAddresses?.join(", "),
				subject: "Build failed for dokploy",
				html: render(
					BuildFailedEmail({
						projectName,
						applicationName,
						applicationType,
						errorMessage,
						buildLink,
					}),
				),
			};
			await transporter.sendMail(mailOptions);
		}
	}
};
