import { BuildFailedEmail } from "@/emails/emails/build-failed";
import BuildSuccessEmail from "@/emails/emails/build-success";
import DatabaseBackupEmail from "@/emails/emails/database-backup";
import DockerCleanupEmail from "@/emails/emails/docker-cleanup";
import DokployRestartEmail from "@/emails/emails/dokploy-restart";
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
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

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

interface BuildFailedEmailProps {
	projectName: string;
	applicationName: string;
	applicationType: string;
	errorMessage: string;
	buildLink: string;
}

export const sendBuildErrorNotifications = async ({
	projectName,
	applicationName,
	applicationType,
	errorMessage,
	buildLink,
}: BuildFailedEmailProps) => {
	const date = new Date();
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.appBuildError, true),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack } = notification;
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
						date: date.toLocaleString(),
					}),
				),
			};
			await transporter.sendMail(mailOptions);
		}

		if (discord) {
			const { webhookUrl } = discord;
			const embed = {
				title: "⚠️ Build Failed",
				color: 0xff0000,
				fields: [
					{
						name: "Project",
						value: projectName,
						inline: true,
					},
					{
						name: "Application",
						value: applicationName,
						inline: true,
					},
					{
						name: "Type",
						value: applicationType,
						inline: true,
					},
					{
						name: "Error",
						value: errorMessage,
					},
					{
						name: "Build Link",
						value: buildLink,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Build Notification",
				},
			};
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					embeds: [embed],
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (telegram) {
			const { botToken, chatId } = telegram;
			const messageText = `
			<b>⚠️ Build Failed</b>
			
			<b>Project:</b> ${projectName}
			<b>Application:</b> ${applicationName}
			<b>Type:</b> ${applicationType}
			<b>Time:</b> ${date.toLocaleString()}
			
			<b>Error:</b>
			<pre>${errorMessage}</pre>
			
			<b>Build Details:</b> ${buildLink}
			`;
			const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					chat_id: chatId,
					text: messageText,
					parse_mode: "HTML",
					disable_web_page_preview: true,
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (slack) {
			const { webhookUrl, channel } = slack;
			const message = {
				channel: channel,
				attachments: [
					{
						color: "#FF0000",
						pretext: ":warning: *Build Failed*",
						fields: [
							{
								title: "Project",
								value: projectName,
								short: true,
							},
							{
								title: "Application",
								value: applicationName,
								short: true,
							},
							{
								title: "Type",
								value: applicationType,
								short: true,
							},
							{
								title: "Time",
								value: date.toLocaleString(),
								short: true,
							},
							{
								title: "Error",
								value: `\`\`\`${errorMessage}\`\`\``,
								short: false,
							},
						],
						actions: [
							{
								type: "button",
								text: "View Build Details",
								url: "https://doks.dev/build-details",
							},
						],
					},
				],
			};
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(message),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}
	}
};

interface BuildSuccessEmailProps {
	projectName: string;
	applicationName: string;
	applicationType: string;
	buildLink: string;
}

export const sendBuildSuccessNotifications = async ({
	projectName,
	applicationName,
	applicationType,
	buildLink,
}: BuildSuccessEmailProps) => {
	const date = new Date();
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.appDeploy, true),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack } = notification;

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
				subject: "Build success for dokploy",
				html: render(
					BuildSuccessEmail({
						projectName,
						applicationName,
						applicationType,
						buildLink,
						date: date.toLocaleString(),
					}),
				),
			};
			await transporter.sendMail(mailOptions);
		}

		if (discord) {
			const { webhookUrl } = discord;
			const embed = {
				title: "✅ Build Success",
				color: 0x00ff00,
				fields: [
					{
						name: "Project",
						value: projectName,
						inline: true,
					},
					{
						name: "Application",
						value: applicationName,
						inline: true,
					},
					{
						name: "Type",
						value: applicationType,
						inline: true,
					},
					{
						name: "Build Link",
						value: buildLink,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Build Notification",
				},
			};
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					embeds: [embed],
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (telegram) {
			const { botToken, chatId } = telegram;
			const messageText = `
			<b>✅ Build Success</b>
			
			<b>Project:</b> ${projectName}
			<b>Application:</b> ${applicationName}
			<b>Type:</b> ${applicationType}
			<b>Time:</b> ${date.toLocaleString()}
			
			<b>Build Details:</b> ${buildLink}
			`;
			const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					chat_id: chatId,
					text: messageText,
					parse_mode: "HTML",
					disable_web_page_preview: true,
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (slack) {
			const { webhookUrl, channel } = slack;
			const message = {
				channel: channel,
				attachments: [
					{
						color: "#00FF00",
						pretext: ":white_check_mark: *Build Success*",
						fields: [
							{
								title: "Project",
								value: projectName,
								short: true,
							},
							{
								title: "Application",
								value: applicationName,
								short: true,
							},
							{
								title: "Type",
								value: applicationType,
								short: true,
							},
							{
								title: "Time",
								value: date.toLocaleString(),
								short: true,
							},
							{
								title: "Build Link",
								value: buildLink,
							},
						],
						actions: [
							{
								type: "button",
								text: "View Build Details",
								url: "https://doks.dev/build-details",
							},
						],
					},
				],
			};
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(message),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}
	}
};

export const sendDatabaseBackupNotifications = async ({
	projectName,
	applicationName,
	databaseType,
	type,
	errorMessage,
}: {
	projectName: string;
	applicationName: string;
	databaseType: "postgres" | "mysql" | "mongodb" | "mariadb";
	type: "error" | "success";
	errorMessage?: string;
}) => {
	const date = new Date();
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.databaseBackup, true),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack } = notification;

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
				subject: "Database backup for dokploy",
				html: render(
					DatabaseBackupEmail({
						projectName,
						applicationName,
						databaseType,
						type,
						errorMessage,
						date: date.toLocaleString(),
					}),
				),
			};
			await transporter.sendMail(mailOptions);
		}

		if (discord) {
			const { webhookUrl } = discord;
			const embed = {
				title:
					type === "success"
						? "✅ Database Backup Successful"
						: "❌ Database Backup Failed",
				color: type === "success" ? 0x00ff00 : 0xff0000,
				fields: [
					{
						name: "Project",
						value: projectName,
						inline: true,
					},
					{
						name: "Application",
						value: applicationName,
						inline: true,
					},
					{
						name: "Type",
						value: databaseType,
						inline: true,
					},
					{
						name: "Time",
						value: date.toLocaleString(),
						inline: true,
					},
					{
						name: "Type",
						value: type,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Database Backup Notification",
				},
			};

			if (type === "error" && errorMessage) {
				embed.fields.push({
					name: "Error Message",
					value: errorMessage as unknown as string,
				});
			}
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					embeds: [embed],
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (telegram) {
			const { botToken, chatId } = telegram;
			const statusEmoji = type === "success" ? "✅" : "❌";
			const messageText = `
				<b>${statusEmoji} Database Backup ${type === "success" ? "Successful" : "Failed"}</b>
			
			<b>Project:</b> ${projectName}
			<b>Application:</b> ${applicationName}
			<b>Type:</b> ${databaseType}
			<b>Time:</b> ${date.toLocaleString()}
			
			<b>Status:</b> ${type === "success" ? "Successful" : "Failed"}
			${type === "error" && errorMessage ? `<b>Error:</b> ${errorMessage}` : ""}
			`;
			const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					chat_id: chatId,
					text: messageText,
					parse_mode: "HTML",
					disable_web_page_preview: true,
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (slack) {
			const { webhookUrl, channel } = slack;
			const message = {
				channel: channel,
				attachments: [
					{
						color: type === "success" ? "#00FF00" : "#FF0000",
						pretext:
							type === "success"
								? ":white_check_mark: *Database Backup Successful*"
								: ":x: *Database Backup Failed*",
						fields: [
							{
								title: "Project",
								value: projectName,
								short: true,
							},
							{
								title: "Application",
								value: applicationName,
								short: true,
							},
							{
								title: "Type",
								value: databaseType,
								short: true,
							},
							{
								title: "Time",
								value: date.toLocaleString(),
								short: true,
							},
							{
								title: "Type",
								value: type,
							},
							{
								title: "Status",
								value: type === "success" ? "Successful" : "Failed",
							},
						],
						actions: [
							{
								type: "button",
								text: "View Build Details",
								url: "https://doks.dev/build-details",
							},
						],
					},
				],
			};

			if (type === "error" && errorMessage) {
				message.attachments[0].fields.push({
					title: "Error Message",
					value: errorMessage,
				});
			}
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(message),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}
	}
};

export const sendDockerCleanupNotifications = async (
	message = "Docker cleanup for dokploy",
) => {
	const date = new Date();
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.dockerCleanup, true),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack } = notification;

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
				subject: "Docker cleanup for dokploy",
				html: render(
					DockerCleanupEmail({
						message,
						date: date.toLocaleString(),
					}),
				),
			};
			await transporter.sendMail(mailOptions);
		}

		if (discord) {
			const { webhookUrl } = discord;
			const embed = {
				title: "✅ Docker Cleanup",
				color: 0x00ff00,
				fields: [
					{
						name: "Message",
						value: message,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Docker Cleanup Notification",
				},
			};
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					embeds: [embed],
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (telegram) {
			const { botToken, chatId } = telegram;
			const messageText = `
			<b>✅ Docker Cleanup</b>
			<b>Message:</b> ${message}
			<b>Time:</b> ${date.toLocaleString()}
			`;
			const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					chat_id: chatId,
					text: messageText,
					parse_mode: "HTML",
					disable_web_page_preview: true,
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (slack) {
			const { webhookUrl, channel } = slack;
			const messageResponse = {
				channel: channel,
				attachments: [
					{
						color: "#00FF00",
						pretext: ":white_check_mark: *Docker Cleanup*",
						fields: [
							{
								title: "Message",
								value: message,
							},
							{
								title: "Time",
								value: date.toLocaleString(),
								short: true,
							},
						],
						actions: [
							{
								type: "button",
								text: "View Build Details",
								url: "https://doks.dev/build-details",
							},
						],
					},
				],
			};
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(messageResponse),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}
	}
};

export const sendEmailNotification = async (
	connection: typeof email.$inferSelect,
	subject: string,
	htmlContent: string,
) => {
	const { smtpServer, smtpPort, username, password, fromAddress, toAddresses } =
		connection;
	const transporter = nodemailer.createTransport({
		host: smtpServer,
		port: smtpPort,
		secure: smtpPort === 465,
		auth: { user: username, pass: password },
	});

	await transporter.sendMail({
		from: fromAddress,
		to: toAddresses.join(", "),
		subject,
		html: htmlContent,
	});
};

export const sendDiscordNotification = async (
	connection: typeof discord.$inferSelect,
	embed: any,
) => {
	const response = await fetch(connection.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ embeds: [embed] }),
	});

	if (!response.ok) throw new Error("Failed to send Discord notification");
};

export const sendTelegramNotification = async (
	connection: typeof telegram.$inferSelect,
	messageText: string,
) => {
	const url = `https://api.telegram.org/bot${connection.botToken}/sendMessage`;
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			chat_id: connection.chatId,
			text: messageText,
			parse_mode: "HTML",
			disable_web_page_preview: true,
		}),
	});

	if (!response.ok) throw new Error("Failed to send Telegram notification");
};

export const sendSlackNotification = async (
	connection: typeof slack.$inferSelect,
	message: any,
) => {
	const response = await fetch(connection.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(message),
	});

	if (!response.ok) throw new Error("Failed to send Slack notification");
};

export const sendDokployRestartNotifications = async () => {
	const date = new Date();
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.dokployRestart, true),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack } = notification;

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
				subject: "Dokploy Server Restarted",
				html: render(
					DokployRestartEmail({
						date: date.toLocaleString(),
					}),
				),
			};
			await transporter.sendMail(mailOptions);
		}

		if (discord) {
			const { webhookUrl } = discord;
			const embed = {
				title: "✅ Dokploy Server Restarted",
				color: 0xff0000,
				fields: [
					{
						name: "Time",
						value: date.toLocaleString(),
						inline: true,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Restart Notification",
				},
			};
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					embeds: [embed],
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (telegram) {
			const { botToken, chatId } = telegram;
			const messageText = `
			<b>✅ Dokploy Serverd Restarted</b>
			<b>Time:</b> ${date.toLocaleString()}
			`;
			const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					chat_id: chatId,
					text: messageText,
					parse_mode: "HTML",
					disable_web_page_preview: true,
				}),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}

		if (slack) {
			const { webhookUrl, channel } = slack;
			const message = {
				channel: channel,
				attachments: [
					{
						color: "#FF0000",
						pretext: ":white_check_mark: *Dokploy Server Restarted*",
						fields: [
							{
								title: "Time",
								value: date.toLocaleString(),
								short: true,
							},
						],
						actions: [
							{
								type: "button",
								text: "View Build Details",
								url: "https://doks.dev/build-details",
							},
						],
					},
				],
			};
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(message),
			});

			if (!response.ok) {
				throw new Error("Error to send test notification");
			}
		}
	}
};
