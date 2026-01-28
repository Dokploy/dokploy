import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import { VolumeBackupEmail } from "@dokploy/server/emails/emails/volume-backup";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendNtfyNotification,
	sendPushoverNotification,
	sendResendNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

export const sendVolumeBackupNotifications = async ({
	projectName,
	applicationName,
	volumeName,
	serviceType,
	type,
	errorMessage,
	organizationId,
	backupSize,
}: {
	projectName: string;
	applicationName: string;
	volumeName: string;
	serviceType:
		| "application"
		| "postgres"
		| "mysql"
		| "mongodb"
		| "mariadb"
		| "redis"
		| "compose";
	type: "error" | "success";
	organizationId: string;
	errorMessage?: string;
	backupSize?: string;
}) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.volumeBackup, true),
			eq(notifications.organizationId, organizationId),
		),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
			resend: true,
			gotify: true,
			ntfy: true,
			pushover: true,
		},
	});

	for (const notification of notificationList) {
		const { email, resend, discord, telegram, slack, gotify, ntfy, pushover } =
			notification;

		if (email || resend) {
			const subject = `Volume Backup ${type === "success" ? "Successful" : "Failed"} - ${applicationName}`;
			const htmlContent = await renderAsync(
				VolumeBackupEmail({
					projectName,
					applicationName,
					volumeName,
					serviceType,
					type,
					errorMessage,
					backupSize,
					date: date.toISOString(),
				}),
			);
			if (email) {
				await sendEmailNotification(email, subject, htmlContent);
			}
			if (resend) {
				await sendResendNotification(resend, subject, htmlContent);
			}
		}

		if (discord) {
			const decorate = (decoration: string, text: string) =>
				`${discord.decoration ? decoration : ""} ${text}`.trim();

			await sendDiscordNotification(discord, {
				title:
					type === "success"
						? decorate(">", "`✅` Volume Backup Successful")
						: decorate(">", "`❌` Volume Backup Failed"),
				color: type === "success" ? 0x57f287 : 0xed4245,
				fields: [
					{
						name: decorate("`🛠️`", "Project"),
						value: projectName,
						inline: true,
					},
					{
						name: decorate("`⚙️`", "Application"),
						value: applicationName,
						inline: true,
					},
					{
						name: decorate("`💾`", "Volume Name"),
						value: volumeName,
						inline: true,
					},
					{
						name: decorate("`🔧`", "Service Type"),
						value: serviceType,
						inline: true,
					},
					...(backupSize
						? [
								{
									name: decorate("`📊`", "Backup Size"),
									value: backupSize,
									inline: true,
								},
							]
						: []),
					{
						name: decorate("`📅`", "Date"),
						value: `<t:${unixDate}:D>`,
						inline: true,
					},
					{
						name: decorate("`⌚`", "Time"),
						value: `<t:${unixDate}:t>`,
						inline: true,
					},
					{
						name: decorate("`❓`", "Type"),
						value: type
							.replace("error", "Failed")
							.replace("success", "Successful"),
						inline: true,
					},
					...(type === "error" && errorMessage
						? [
								{
									name: decorate("`⚠️`", "Error Message"),
									value: `\`\`\`${errorMessage}\`\`\``,
								},
							]
						: []),
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Volume Backup Notification",
				},
			});
		}

		if (gotify) {
			const decorate = (decoration: string, text: string) =>
				`${gotify.decoration ? decoration : ""} ${text}\n`;

			await sendGotifyNotification(
				gotify,
				decorate(
					type === "success" ? "✅" : "❌",
					`Volume Backup ${type === "success" ? "Successful" : "Failed"}`,
				),
				`${decorate("🛠️", `Project: ${projectName}`)}` +
					`${decorate("⚙️", `Application: ${applicationName}`)}` +
					`${decorate("💾", `Volume Name: ${volumeName}`)}` +
					`${decorate("🔧", `Service Type: ${serviceType}`)}` +
					`${backupSize ? decorate("📊", `Backup Size: ${backupSize}`) : ""}` +
					`${decorate("🕒", `Date: ${date.toLocaleString()}`)}` +
					`${type === "error" && errorMessage ? decorate("❌", `Error:\n${errorMessage}`) : ""}`,
			);
		}

		if (ntfy) {
			await sendNtfyNotification(
				ntfy,
				`Volume Backup ${type === "success" ? "Successful" : "Failed"}`,
				`${type === "success" ? "white_check_mark" : "x"}`,
				"",
				`🛠️Project: ${projectName}\n` +
					`⚙️Application: ${applicationName}\n` +
					`💾Volume Name: ${volumeName}\n` +
					`🔧Service Type: ${serviceType}\n` +
					`${backupSize ? `📊Backup Size: ${backupSize}\n` : ""}` +
					`🕒Date: ${date.toLocaleString()}\n` +
					`${type === "error" && errorMessage ? `❌Error:\n${errorMessage}` : ""}`,
			);
		}

		if (telegram) {
			const isError = type === "error" && errorMessage;

			const statusEmoji = type === "success" ? "✅" : "❌";
			const typeStatus = type === "success" ? "Successful" : "Failed";
			const errorMsg = isError
				? `\n\n<b>Error:</b>\n<pre>${errorMessage}</pre>`
				: "";
			const sizeInfo = backupSize ? `\n<b>Backup Size:</b> ${backupSize}` : "";

			const messageText = `<b>${statusEmoji} Volume Backup ${typeStatus}</b>\n\n<b>Project:</b> ${projectName}\n<b>Application:</b> ${applicationName}\n<b>Volume Name:</b> ${volumeName}\n<b>Service Type:</b> ${serviceType}${sizeInfo}\n<b>Date:</b> ${format(date, "PP")}\n<b>Time:</b> ${format(date, "pp")}${isError ? errorMsg : ""}`;

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
								? ":white_check_mark: *Volume Backup Successful*"
								: ":x: *Volume Backup Failed*",
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
								title: "Volume Name",
								value: volumeName,
								short: true,
							},
							{
								title: "Service Type",
								value: serviceType,
								short: true,
							},
							...(backupSize
								? [
										{
											title: "Backup Size",
											value: backupSize,
											short: true,
										},
									]
								: []),
							{
								title: "Time",
								value: date.toLocaleString(),
								short: true,
							},
							{
								title: "Type",
								value: type,
								short: true,
							},
							{
								title: "Status",
								value: type === "success" ? "Successful" : "Failed",
								short: true,
							},
						],
					},
				],
			});
		}

		if (pushover) {
			await sendPushoverNotification(
				pushover,
				`Volume Backup ${type === "success" ? "Successful" : "Failed"}`,
				`Project: ${projectName}\nApplication: ${applicationName}\nVolume: ${volumeName}\nService Type: ${serviceType}${backupSize ? `\nBackup Size: ${backupSize}` : ""}\nDate: ${date.toLocaleString()}${type === "error" && errorMessage ? `\nError: ${errorMessage}` : ""}`,
			);
		}
	}
};
