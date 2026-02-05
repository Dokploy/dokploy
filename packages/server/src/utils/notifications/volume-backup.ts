import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import { VolumeBackupEmail } from "@dokploy/server/emails/emails/volume-backup";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import {
	sendCustomNotification,
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendLarkNotification,
	sendMattermostNotification,
	sendNtfyNotification,
	sendPushoverNotification,
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
			gotify: true,
			ntfy: true,
			mattermost: true,
			custom: true,
			lark: true,
			pushover: true,
		},
	});

	for (const notification of notificationList) {
		const {
			email,
			discord,
			telegram,
			slack,
			gotify,
			ntfy,
			mattermost,
			custom,
			lark,
			pushover,
		} = notification;

		try {
			if (email) {
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
				await sendEmailNotification(email, subject, htmlContent);
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

			if (mattermost) {
				const statusEmoji = type === "success" ? "✅" : "❌";
				const typeStatus = type === "success" ? "Successful" : "Failed";
				const errorMsg =
					type === "error" && errorMessage
						? `\n\n**Error:**\n\`\`\`\n${errorMessage}\n\`\`\``
						: "";
				const sizeInfo = backupSize ? `\n**Backup Size:** ${backupSize}` : "";

				await sendMattermostNotification(mattermost, {
					text: `**${statusEmoji} Volume Backup ${typeStatus}**\n\n**Project:** ${projectName}\n**Application:** ${applicationName}\n**Volume Name:** ${volumeName}\n**Service Type:** ${serviceType}${sizeInfo}\n**Date:** ${format(date, "PP")}\n**Time:** ${format(date, "pp")}${errorMsg}`,
					channel: mattermost.channel,
					username: mattermost.username || "Dokploy",
				});
			}

			if (custom) {
				await sendCustomNotification(custom, {
					title: `Volume Backup ${type === "success" ? "Successful" : "Failed"}`,
					message:
						type === "success"
							? "Volume backup completed successfully"
							: "Volume backup failed",
					projectName,
					applicationName,
					volumeName,
					serviceType,
					type,
					errorMessage: errorMessage || "",
					backupSize: backupSize || "",
					timestamp: date.toISOString(),
					date: date.toLocaleString(),
					status: type,
				});
			}

			if (lark) {
				const limitCharacter = 800;
				const truncatedErrorMessage =
					errorMessage && errorMessage.length > limitCharacter
						? errorMessage.substring(0, limitCharacter)
						: errorMessage;

				await sendLarkNotification(lark, {
					msg_type: "interactive",
					card: {
						schema: "2.0",
						config: {
							update_multi: true,
							style: {
								text_size: {
									normal_v2: {
										default: "normal",
										pc: "normal",
										mobile: "heading",
									},
								},
							},
						},
						header: {
							title: {
								tag: "plain_text",
								content:
									type === "success"
										? "✅ Volume Backup Successful"
										: "❌ Volume Backup Failed",
							},
							subtitle: {
								tag: "plain_text",
								content: "",
							},
							template: type === "success" ? "green" : "red",
							padding: "12px 12px 12px 12px",
						},
						body: {
							direction: "vertical",
							padding: "12px 12px 12px 12px",
							elements: [
								{
									tag: "column_set",
									columns: [
										{
											tag: "column",
											width: "weighted",
											elements: [
												{
													tag: "markdown",
													content: `**Project:**\n${projectName}`,
													text_align: "left",
													text_size: "normal_v2",
												},
												{
													tag: "markdown",
													content: `**Volume Name:**\n${volumeName}`,
													text_align: "left",
													text_size: "normal_v2",
												},
												{
													tag: "markdown",
													content: `**Status:**\n${type === "success" ? "Successful" : "Failed"}`,
													text_align: "left",
													text_size: "normal_v2",
												},
											],
											vertical_align: "top",
											weight: 1,
										},
										{
											tag: "column",
											width: "weighted",
											elements: [
												{
													tag: "markdown",
													content: `**Application:**\n${applicationName}`,
													text_align: "left",
													text_size: "normal_v2",
												},
												{
													tag: "markdown",
													content: `**Service Type:**\n${serviceType}`,
													text_align: "left",
													text_size: "normal_v2",
												},
												{
													tag: "markdown",
													content: `**Date:**\n${format(date, "PP pp")}`,
													text_align: "left",
													text_size: "normal_v2",
												},
											],
											vertical_align: "top",
											weight: 1,
										},
									],
								},
								...(type === "error" && truncatedErrorMessage
									? [
											{
												tag: "markdown",
												content: `**Error Message:**\n\`\`\`\n${truncatedErrorMessage}\n\`\`\``,
												text_align: "left",
												text_size: "normal_v2",
											},
										]
									: []),
							],
						},
					},
				});
			}

			if (pushover) {
				await sendPushoverNotification(
					pushover,
					`Volume Backup ${type === "success" ? "Successful" : "Failed"}`,
					`Project: ${projectName}\nApplication: ${applicationName}\nVolume: ${volumeName}\nService Type: ${serviceType}${backupSize ? `\nBackup Size: ${backupSize}` : ""}\nDate: ${date.toLocaleString()}${type === "error" && errorMessage ? `\nError: ${errorMessage}` : ""}`,
				);
			}
		} catch (error) {
			console.log(error);
		}
	}
};
