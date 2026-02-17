import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import DockerCleanupEmail from "@dokploy/server/emails/emails/docker-cleanup";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
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
	sendTeamsNotification,
	sendTelegramNotification,
} from "./utils";

export const sendDockerCleanupNotifications = async (
	organizationId: string,
	message = "Docker cleanup for dokploy",
) => {
	const date = new Date();
	const unixDate = ~~(Number(date) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.dockerCleanup, true),
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
			custom: true,
			lark: true,
			pushover: true,
			teams: true,
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
			teams,
		} = notification;
		try {
			if (email || resend) {
				const template = await renderAsync(
					DockerCleanupEmail({ message, date: date.toLocaleString() }),
				).catch();

				if (email) {
					await sendEmailNotification(
						email,
						"Docker cleanup for dokploy",
						template,
					);
				}

				if (resend) {
					await sendResendNotification(
						resend,
						"Docker cleanup for dokploy",
						template,
					);
				}
			}

			if (discord) {
				const decorate = (decoration: string, text: string) =>
					`${discord.decoration ? decoration : ""} ${text}`.trim();

				await sendDiscordNotification(discord, {
					title: decorate(">", "`✅` Docker Cleanup"),
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
						{
							name: decorate("`📜`", "Message"),
							value: `\`\`\`${message}\`\`\``,
						},
					],
					timestamp: date.toISOString(),
					footer: {
						text: "Dokploy Docker Cleanup Notification",
					},
				});
			}

			if (gotify) {
				const decorate = (decoration: string, text: string) =>
					`${gotify.decoration ? decoration : ""} ${text}\n`;
				await sendGotifyNotification(
					gotify,
					decorate("✅", "Docker Cleanup"),
					`${decorate("🕒", `Date: ${date.toLocaleString()}`)}` +
						`${decorate("📜", `Message:\n${message}`)}`,
				);
			}

			if (ntfy) {
				await sendNtfyNotification(
					ntfy,
					"Docker Cleanup",
					"white_check_mark",
					"",
					`🕒Date: ${date.toLocaleString()}\n` + `📜Message:\n${message}`,
				);
			}

			if (telegram) {
				await sendTelegramNotification(
					telegram,
					`<b>✅ Docker Cleanup</b>\n\n<b>Message:</b> ${message}\n<b>Date:</b> ${format(date, "PP")}\n<b>Time:</b> ${format(date, "pp")}`,
				);
			}

			if (slack) {
				const { channel } = slack;
				await sendSlackNotification(slack, {
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
						},
					],
				});
			}

			if (custom) {
				await sendCustomNotification(custom, {
					title: "Docker Cleanup",
					message: "Docker cleanup completed successfully",
					cleanupMessage: message,
					timestamp: date.toISOString(),
					date: date.toLocaleString(),
					status: "success",
					type: "docker-cleanup",
				});
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
								content: "✅ Docker Cleanup",
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
												{
													tag: "markdown",
													content: `**Cleanup Details:**\n${message}`,
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
							],
						},
					},
				});
			}

			if (pushover) {
				await sendPushoverNotification(
					pushover,
					"Docker Cleanup",
					`Date: ${date.toLocaleString()}\nMessage: ${message}`,
				);
			}

			if (teams) {
				await sendTeamsNotification(teams, {
					title: "✅ Docker Cleanup",
					facts: [
						{ name: "Date", value: format(date, "PP pp") },
						{ name: "Message", value: message },
					],
				});
			}
		} catch (error) {
			console.log(error);
		}
	}
};
