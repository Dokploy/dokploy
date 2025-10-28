import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import DokployRestartEmail from "@dokploy/server/emails/emails/dokploy-restart";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendLarkNotification,
	sendGotifyNotification,
	sendMattermostNotification,
	sendNtfyNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

export const sendDokployRestartNotifications = async () => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.dokployRestart, true),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
			gotify: true,
			ntfy: true,
			mattermost: true,
			lark: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack, gotify, ntfy, mattermost, lark } = notification;

		if (email) {
			const template = await renderAsync(
				DokployRestartEmail({ date: date.toLocaleString() }),
			).catch();
			await sendEmailNotification(email, "Dokploy Server Restarted", template);
		}

		if (discord) {
			const decorate = (decoration: string, text: string) =>
				`${discord.decoration ? decoration : ""} ${text}`.trim();

			try {
				await sendDiscordNotification(discord, {
					title: decorate(">", "`✅` Dokploy Server Restarted"),
					color: 0x57f287,
					fields: [
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
							value: "Successful",
							inline: true,
						},
					],
					timestamp: date.toISOString(),
					footer: {
						text: "Dokploy Restart Notification",
					},
				});
			} catch (error) {
				console.log(error);
			}
		}

		if (gotify) {
			const decorate = (decoration: string, text: string) =>
				`${gotify.decoration ? decoration : ""} ${text}\n`;
			try {
				await sendGotifyNotification(
					gotify,
					decorate("✅", "Dokploy Server Restarted"),
					`${decorate("🕒", `Date: ${date.toLocaleString()}`)}`,
				);
			} catch (error) {
				console.log(error);
			}
		}

		if (ntfy) {
			try {
				await sendNtfyNotification(
					ntfy,
					"Dokploy Server Restarted",
					"white_check_mark",
					"",
					`🕒Date: ${date.toLocaleString()}`,
				);
			} catch (error) {
				console.log(error);
			}
		}

		if (telegram) {
			try {
				await sendTelegramNotification(
					telegram,
					`<b>✅ Dokploy Server Restarted</b>\n\n<b>Date:</b> ${format(date, "PP")}\n<b>Time:</b> ${format(date, "pp")}`,
				);
			} catch (error) {
				console.log(error);
			}
		}

		if (slack) {
			const { channel } = slack;
			try {
				await sendSlackNotification(slack, {
					channel: channel,
					attachments: [
						{
							color: "#00FF00",
							pretext: ":white_check_mark: *Dokploy Server Restarted*",
							fields: [
								{
									title: "Time",
									value: date.toLocaleString(),
									short: true,
								},
							],
						},
					],
				});
			} catch (error) {
				console.log(error);
			}
		}

		if (mattermost) {
			try {
				await sendMattermostNotification(mattermost, {
					text: `**✅ Dokploy Server Restarted**\n\n**Date:** ${format(date, "PP")}\n**Time:** ${format(date, "pp")}`,
					channel: mattermost.channel,
					username: mattermost.username || "Dokploy",
				});
			} catch (error) {
				console.log(error);
			}
		}
		
		if (lark) {
			try {
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
								content: "✅ Dokploy Server Restarted",
							},
							subtitle: {
								tag: "plain_text",
								content: "",
							},
							template: "green",
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
													content: `**Status:**\nSuccessful`,
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
													content: `**Restart Time:**\n${format(date, "PP pp")}`,
													text_align: "left",
													text_size: "normal_v2",
												},
											],
											vertical_align: "top",
											weight: 1,
										},
									],
								},
							],
						},
					},
				});
			} catch (error) {
				console.log(error);
			}
		}
	}
};
