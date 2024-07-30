import DatabaseBackupEmail from "@/emails/emails/database-backup";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { renderAsync } from "@react-email/components";
import { eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

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
			const template = await renderAsync(
				DatabaseBackupEmail({
					projectName,
					applicationName,
					databaseType,
					type,
					errorMessage,
					date: date.toLocaleString(),
				}),
			).catch();
			await sendEmailNotification(
				email,
				"Database backup for dokploy",
				template,
			);
		}

		if (discord) {
			await sendDiscordNotification(discord, {
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
					...(type === "error" && errorMessage
						? [
								{
									name: "Error Message",
									value: errorMessage,
								},
							]
						: []),
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Database Backup Notification",
				},
			});
		}

		if (telegram) {
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
			await sendTelegramNotification(telegram, messageText);
		}

		if (slack) {
			const { channel } = slack;
			await sendSlackNotification(slack, {
				channel: channel,
				attachments: [
					{
						color: type === "success" ? "#00FF00" : "#FF0000",
						pretext:
							type === "success"
								? ":white_check_mark: *Database Backup Successful*"
								: ":x: *Database Backup Failed*",
						fields: [
							...(type === "error" && errorMessage
								? [
										{
											title: "Error Message",
											value: errorMessage,
											short: false,
										},
									]
								: []),
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
					},
				],
			});
		}
	}
};
