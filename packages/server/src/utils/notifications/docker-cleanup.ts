import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import DockerCleanupEmail from "@dokploy/server/emails/emails/docker-cleanup";
import { renderAsync } from "@react-email/components";
import { and, eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

export const sendDockerCleanupNotifications = async (
	adminId: string,
	message = "Docker cleanup for dokploy",
) => {
	const date = new Date();
	const unixDate = ~~((Number(date)) / 1000);
	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.dockerCleanup, true),
			eq(notifications.adminId, adminId),
		),
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
				DockerCleanupEmail({ message, date: date.toLocaleString() }),
			).catch();

			await sendEmailNotification(
				email,
				"Docker cleanup for dokploy",
				template,
			);
		}

		if (discord) {
			await sendDiscordNotification(discord, {
				title: "> `✅` - Docker Cleanup",
				color: 0x57f287,
				fields: [
					{
						name: "`📅`・Date",
						value: `<t:${unixDate}:D>`,
						inline: true,
					},
					{
						name: "`⌚`・Time",
						value: `<t:${unixDate}:t>`,
						inline: true,
					},
					{
						name: "`❓`・Type",
						value: "Successful",
						inline: true,
					},
					{
						name: "`📜`・Message",
						value: `\`\`\`${message}\`\`\``,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Docker Cleanup Notification",
				},
			});
		}

		if (telegram) {
			await sendTelegramNotification(
				telegram,
				`
				<b>✅ Docker Cleanup</b>
				<b>Message:</b> ${message}
				<b>Time:</b> ${date.toLocaleString()}
			`,
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
	}
};
