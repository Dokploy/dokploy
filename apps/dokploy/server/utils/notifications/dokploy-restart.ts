import { renderAsync } from "@react-email/components";
import { eq } from "drizzle-orm";
import DokployRestartEmail from "~/emails/emails/dokploy-restart";
import { db } from "~/server/db";
import { notifications } from "~/server/db/schema";
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
			const template = await renderAsync(
				DokployRestartEmail({ date: date.toLocaleString() }),
			).catch();
			await sendEmailNotification(email, "Dokploy Server Restarted", template);
		}

		if (discord) {
			await sendDiscordNotification(discord, {
				title: "✅ Dokploy Server Restarted",
				color: 0xff0000,
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
	}
};
