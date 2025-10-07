import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import DockerCleanupEmail from "@dokploy/server/emails/emails/docker-cleanup";
import { renderAsync } from "@react-email/components";
import { format } from "date-fns";
import { and, eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendNtfyNotification,
	sendSlackNotification,
	sendTelegramNotification,
	sendTeamsNotification,
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
			gotify: true,
			ntfy: true,
			teams: true,
		},
	});

	for (const notification of notificationList) {
		const { email, discord, telegram, slack, gotify, ntfy, teams } =
			notification;

		if (email) {
			const template = await renderAsync(
				DockerCleanupEmail({ message, date: date.toLocaleString() }),
			).catch();

			await sendEmailNotification(
				email,
				"Docker cleanup for dokploy",
				template,
			);
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

		if (teams) {
			try {
				const teamsMessage = {
					"@type": "MessageCard",
					"@context": "http://schema.org/extensions",
					themeColor: "00FF00",
					summary: "Docker Cleanup",
					sections: [
						{
							activityTitle: "✅ Docker Cleanup",
							activitySubtitle: "Docker cleanup completed successfully",
							facts: [
								{
									name: "Date",
									value: date.toLocaleString(),
								},
								{
									name: "Message",
									value: message,
								},
								{
									name: "Status",
									value: "Successful",
								},
							],
						},
					],
				};
				
				await sendTeamsNotification(teams, teamsMessage);
			} catch (error) {
				console.log(error);
			}
		}
	}
};
