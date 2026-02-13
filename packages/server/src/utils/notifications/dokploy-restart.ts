import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import DokployRestartEmail from "@dokploy/server/emails/emails/dokploy-restart";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import {
	sendCustomNotification,
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendLarkNotification,
	sendNtfyNotification,
	sendPushoverNotification,
	sendResendNotification,
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
			resend: true,
			gotify: true,
			ntfy: true,
			custom: true,
			lark: true,
			pushover: true,
		},
	});

	for (const notification of notificationList) {
		const {
			email,
			resend,
			discord,
			telegram,
			slack,
			gotify,
			ntfy,
			custom,
			lark,
			pushover,
		} = notification;

		try {
			if (email || resend) {
				const template = await renderAsync(
					DokployRestartEmail({ date: date.toLocaleString() }),
				).catch();

				if (email) {
					await sendEmailNotification(
						email,
						"Dokploy Server Restarted",
						template,
					);
				}

				if (resend) {
					await sendResendNotification(
						resend,
						"Dokploy Server Restarted",
						template,
					);
				}
			}

			if (discord) {
				const decorate = (decoration: string, text: string) =>
					`${discord.decoration ? decoration : ""} ${text}`.trim();

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
			}

			if (gotify) {
				const decorate = (decoration: string, text: string) =>
					`${gotify.decoration ? decoration : ""} ${text}\n`;
				await sendGotifyNotification(
					gotify,
					decorate("✅", "Dokploy Server Restarted"),
					`${decorate("🕒", `Date: ${date.toLocaleString()}`)}`,
				);
			}

			if (ntfy) {
				await sendNtfyNotification(
					ntfy,
					"Dokploy Server Restarted",
					"white_check_mark",
					"",
					`🕒Date: ${date.toLocaleString()}`,
				);
			}

			if (telegram) {
				await sendTelegramNotification(
					telegram,
					`<b>✅ Dokploy Server Restarted</b>\n\n<b>Date:</b> ${format(
						date,
						"PP",
					)}\n<b>Time:</b> ${format(date, "pp")}`,
				);
			}

			if (slack) {
				const { channel } = slack;
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
			}

			if (custom) {
				try {
					await sendCustomNotification(custom, {
						title: "Dokploy Server Restarted",
						message: "Dokploy server has been restarted successfully",
						timestamp: date.toISOString(),
						date: date.toLocaleString(),
						status: "success",
						type: "dokploy-restart",
					});
				} catch (error) {
					console.log(error);
				}
			}

			if (lark) {
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
													content: "**Status:**\nSuccessful",
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
													content: `**Restart Time:**\n${format(
														date,
														"PP pp",
													)}`,
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
			}

			if (pushover) {
				await sendPushoverNotification(
					pushover,
					"Dokploy Server Restarted",
					`Date: ${date.toLocaleString()}`,
				);
			}
		} catch (error) {
			console.log(error);
		}
	}
};
