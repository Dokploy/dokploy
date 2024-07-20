import DockerCleanupEmail from "@/emails/emails/docker-cleanup";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { render } from "@react-email/components";
import { eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

export const sendDockerCleanupNotifications = async (
	message = "Docker cleanup for dokploy",
) => {
	const date = new Date();
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.dockerCleanup, true),
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
			await sendEmailNotification(
				email,
				"Docker cleanup for dokploy",
				render(DockerCleanupEmail({ message, date: date.toLocaleString() })),
			);
		}

		if (discord) {
			await sendDiscordNotification(discord, {
				title: "✅ Docker Cleanup",
				color: 0x00ff00,
				fields: [
					{
						name: "Message",
						value: message,
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
						actions: [
							{
								type: "button",
								text: "View Build Details",
								url: "https://doks.dev/build-details",
							},
						],
					},
				],
			});
		}
	}
};
