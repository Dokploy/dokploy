import DokployRestartEmail from "@/emails/emails/dokploy-restart";
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

export const sendDokployRestartNotifications = async () => {
	const date = new Date();
	const notificationList = await db.query.notifications.findMany({
		where: eq(notifications.dokployRestart, true),
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
				"Dokploy Server Restarted",
				render(DokployRestartEmail({ date: date.toLocaleString() })),
			);
		}

		if (discord) {
			await sendDiscordNotification(discord, {
				title: "✅ Dokploy Server Restarted",
				color: 0x00ff00,
				fields: [
					{
						name: "Time",
						value: date.toLocaleString(),
						inline: true,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Restart Notification",
				},
			});
		}

		if (telegram) {
			await sendTelegramNotification(
				telegram,
				`
				<b>✅ Dokploy Serverd Restarted</b>
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
						color: "#FF0000",
						pretext: ":white_check_mark: *Dokploy Server Restarted*",
						fields: [
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
