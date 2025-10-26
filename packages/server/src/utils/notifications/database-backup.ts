import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import DatabaseBackupEmail from "@dokploy/server/emails/emails/database-backup";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendLarkNotification,
	sendGotifyNotification,
	sendNtfyNotification,
	sendSlackNotification,
	sendTelegramNotification,
	sendTeamsNotification,
} from "./utils";

export const sendDatabaseBackupNotifications = async ({
	projectName,
	applicationName,
	databaseType,
	type,
	errorMessage,
	organizationId,
	databaseName,
}: {
	projectName: string;
	applicationName: string;
	databaseType: "postgres" | "mysql" | "mongodb" | "mariadb";
	type: "error" | "success";
	organizationId: string;
	errorMessage?: string;
	databaseName: string;
}) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.databaseBackup, true),
			eq(notifications.organizationId, organizationId),
		),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
			gotify: true,
			ntfy: true,

			teams: true,

			lark: true,

		},
	});

	for (const notification of notificationList) {

		const { email, discord, telegram, slack, gotify, ntfy, teams } =

		const { email, discord, telegram, slack, gotify, ntfy, lark } =

			notification;

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
			const decorate = (decoration: string, text: string) =>
				`${discord.decoration ? decoration : ""} ${text}`.trim();

			await sendDiscordNotification(discord, {
				title:
					type === "success"
						? decorate(">", "`✅` Database Backup Successful")
						: decorate(">", "`❌` Database Backup Failed"),
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
						name: decorate("`❔`", "Database"),
						value: databaseType,
						inline: true,
					},
					{
						name: decorate("`📂`", "Database Name"),
						value: databaseName,
						inline: true,
					},
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
					text: "Dokploy Database Backup Notification",
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
					`Database Backup ${type === "success" ? "Successful" : "Failed"}`,
				),
				`${decorate("🛠️", `Project: ${projectName}`)}` +
					`${decorate("⚙️", `Application: ${applicationName}`)}` +
					`${decorate("❔", `Type: ${databaseType}`)}` +
					`${decorate("📂", `Database Name: ${databaseName}`)}` +
					`${decorate("🕒", `Date: ${date.toLocaleString()}`)}` +
					`${type === "error" && errorMessage ? decorate("❌", `Error:\n${errorMessage}`) : ""}`,
			);
		}

		if (ntfy) {
			await sendNtfyNotification(
				ntfy,
				`Database Backup ${type === "success" ? "Successful" : "Failed"}`,
				`${type === "success" ? "white_check_mark" : "x"}`,
				"",
				`🛠Project: ${projectName}\n` +
					`⚙️Application: ${applicationName}\n` +
					`❔Type: ${databaseType}\n` +
					`📂Database Name: ${databaseName}` +
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

			const messageText = `<b>${statusEmoji} Database Backup ${typeStatus}</b>\n\n<b>Project:</b> ${projectName}\n<b>Application:</b> ${applicationName}\n<b>Type:</b> ${databaseType}\n<b>Database Name:</b> ${databaseName}\n<b>Date:</b> ${format(date, "PP")}\n<b>Time:</b> ${format(date, "pp")}${isError ? errorMsg : ""}`;

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
								title: "Database Name",
								value: databaseName,
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


		if (teams) {
			const message = {
				"@type": "MessageCard",
				"@context": "http://schema.org/extensions",
				themeColor: type === "success" ? "00FF00" : "FF0000",
				summary: `Database Backup ${type === "success" ? "Successful" : "Failed"}`,
				sections: [
					{
						activityTitle: `🗄️ Database Backup ${type === "success" ? "Successful" : "Failed"}`,
						activitySubtitle: `${projectName} - ${applicationName}`,
						facts: [
							{
								name: "Project",
								value: projectName,
							},
							{
								name: "Application",
								value: applicationName,
							},
							{
								name: "Database Type",
								value: databaseType,
							},
							{
								name: "Database Name",
								value: databaseName,
							},
							{
								name: "Date",
								value: date.toLocaleString(),
							},
							{
								name: "Status",
								value: type === "success" ? "Successful" : "Failed",
							},
						],
					},
				],
			};

			if (type === "error" && errorMessage && message.sections[0]) {
				message.sections[0].facts.push({
					name: "Error",
					value: errorMessage,
				});
			}

			await sendTeamsNotification(teams, message);

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
									? "✅ Database Backup Successful"
									: "❌ Database Backup Failed",
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
												content: `**Database Type:**\n${databaseType}`,
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
												content: `**Database Name:**\n${databaseName}`,
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
	}
};
