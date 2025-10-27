import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import DokployBackupEmail from "@dokploy/server/emails/emails/dokploy-backup";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendLarkNotification,
	sendGotifyNotification,
	sendNtfyNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

export const sendDokployBackupNotifications = async ({
	type,
	errorMessage,
	backupSize,
}: {
	type: "error" | "success";
	errorMessage?: string;
	backupSize?: string;
}) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.dokployBackup, true),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
			gotify: true,
			ntfy: true,
			lark: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack, gotify, ntfy, lark } =
			notification;

		if (email) {
			const template = await renderAsync(
				DokployBackupEmail({
					type,
					errorMessage,
					date: date.toLocaleString(),
					backupSize,
				}),
			).catch();
			await sendEmailNotification(
				email,
				"Dokploy instance backup",
				template,
			);
		}

		if (discord) {
			const decorate = (decoration: string, text: string) =>
				`${discord.decoration ? decoration : ""} ${text}`.trim();

			await sendDiscordNotification(discord, {
				title:
					type === "success"
						? decorate(">", "`✅` Dokploy Backup Successful")
						: decorate(">", "`❌` Dokploy Backup Failed"),
				color: type === "success" ? 0x57f287 : 0xed4245,
				fields: [
					{
						name: decorate("`📦`", "Backup Type"),
						value: "Complete Dokploy Instance",
						inline: true,
					},
					...(backupSize
						? [
								{
									name: decorate("`💾`", "Backup Size"),
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
						name: decorate("`❓`", "Status"),
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
					text: "Dokploy Instance Backup Notification",
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
					`Dokploy Backup ${type === "success" ? "Successful" : "Failed"}`,
				),
				`${decorate("📦", "Backup Type: Complete Dokploy Instance")}` +
					`${backupSize ? decorate("💾", `Backup Size: ${backupSize}`) : ""}` +
					`${decorate("🕒", `Date: ${date.toLocaleString()}`)}` +
					`${type === "error" && errorMessage ? decorate("❌", `Error:\n${errorMessage}`) : ""}`,
			);
		}

		if (ntfy) {
			await sendNtfyNotification(
				ntfy,
				`Dokploy Backup ${type === "success" ? "Successful" : "Failed"}`,
				`${type === "success" ? "white_check_mark" : "x"}`,
				"",
				`📦Backup Type: Complete Dokploy Instance\n` +
					`${backupSize ? `💾Backup Size: ${backupSize}\n` : ""}` +
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

			const messageText = `<b>${statusEmoji} Dokploy Backup ${typeStatus}</b>\n\n<b>Backup Type:</b> Complete Dokploy Instance${sizeInfo}\n<b>Date:</b> ${format(date, "PP")}\n<b>Time:</b> ${format(date, "pp")}${isError ? errorMsg : ""}`;

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
								? ":white_check_mark: *Dokploy Backup Successful*"
								: ":x: *Dokploy Backup Failed*",
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
								title: "Backup Type",
								value: "Complete Dokploy Instance",
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
								title: "Status",
								value: type === "success" ? "Successful" : "Failed",
								short: true,
							},
						],
					},
				],
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
									? "✅ Dokploy Backup Successful"
									: "❌ Dokploy Backup Failed",
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
												content: `**Backup Type:**\nComplete Dokploy Instance`,
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
											...(backupSize
												? [
														{
															tag: "markdown",
															content: `**Backup Size:**\n${backupSize}`,
															text_align: "left",
															text_size: "normal_v2",
														},
													]
												: []),
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