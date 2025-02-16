import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { notifications } from "../../db/schema";
import {
	sendDiscordNotification,
	sendSlackNotification,
	sendTelegramNotification,
} from "./utils";

interface ServerThresholdPayload {
	Type: "CPU" | "Memory";
	Value: number;
	Threshold: number;
	Message: string;
	Timestamp: string;
	Token: string;
	ServerName: string;
}

export const sendServerThresholdNotifications = async (
	organizationId: string,
	payload: ServerThresholdPayload,
) => {
	const date = new Date(payload.Timestamp);
	const unixDate = ~~(Number(date) / 1000);

	const notificationList = await db.query.notifications.findMany({
		where: and(
			eq(notifications.serverThreshold, true),
			eq(notifications.organizationId, organizationId),
		),
		with: {
			email: true,
			discord: true,
			telegram: true,
			slack: true,
		},
	});

	const typeEmoji = payload.Type === "CPU" ? "🔲" : "💾";
	const typeColor = 0xff0000; // Rojo para indicar alerta

	for (const notification of notificationList) {
		const { discord, telegram, slack } = notification;

		if (discord) {
			const decorate = (decoration: string, text: string) =>
				`${discord.decoration ? decoration : ""} ${text}`.trim();

			await sendDiscordNotification(discord, {
				title: decorate(">", `\`⚠️\` Server ${payload.Type} Alert`),
				color: typeColor,
				fields: [
					{
						name: decorate("`🏷️`", "Server Name"),
						value: payload.ServerName,
						inline: true,
					},
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
						name: decorate(typeEmoji, "Type"),
						value: payload.Type,
						inline: true,
					},
					{
						name: decorate("📊", "Current Value"),
						value: `${payload.Value.toFixed(2)}%`,
						inline: true,
					},
					{
						name: decorate("⚠️", "Threshold"),
						value: `${payload.Threshold.toFixed(2)}%`,
						inline: true,
					},
					{
						name: decorate("`📜`", "Message"),
						value: `\`\`\`${payload.Message}\`\`\``,
					},
				],
				timestamp: date.toISOString(),
				footer: {
					text: "Dokploy Server Monitoring Alert",
				},
			});
		}

		if (telegram) {
			await sendTelegramNotification(
				telegram,
				`
				<b>⚠️ Server ${payload.Type} Alert</b>
                <b>Server Name:</b> ${payload.ServerName}
				<b>Type:</b> ${payload.Type}
				<b>Current Value:</b> ${payload.Value.toFixed(2)}%
				<b>Threshold:</b> ${payload.Threshold.toFixed(2)}%
				<b>Message:</b> ${payload.Message}
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
						pretext: `:warning: *Server ${payload.Type} Alert*`,
						fields: [
							{
								title: "Server Name",
								value: payload.ServerName,
								short: true,
							},
							{
								title: "Type",
								value: payload.Type,
								short: true,
							},
							{
								title: "Current Value",
								value: `${payload.Value.toFixed(2)}%`,
								short: true,
							},
							{
								title: "Threshold",
								value: `${payload.Threshold.toFixed(2)}%`,
								short: true,
							},
							{
								title: "Message",
								value: payload.Message,
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
