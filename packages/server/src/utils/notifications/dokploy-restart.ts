import { db } from "@dokploy/server/db";
import { notifications } from "@dokploy/server/db/schema";
import DokployRestartEmail from "@dokploy/server/emails/emails/dokploy-restart";
import { renderAsync } from "@react-email/components";
import { eq } from "drizzle-orm";
import {
	sendDiscordNotification,
	sendEmailNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

export const sendDokployRestartNotifications = async () => {
	const date = new Date();
	const unixDate = ~~((Number(date)) / 1000);
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
				title: "> `✅` - Dokploy Server Restarted",
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
