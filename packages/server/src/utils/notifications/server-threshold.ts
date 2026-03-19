import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { notifications } from "../../db/schema";
import {
	sendCustomNotification,
	sendDiscordNotification,
	sendLarkNotification,
	sendPushoverNotification,
	sendSlackNotification,
	sendTeamsNotification,
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
			custom: true,
			lark: true,
			pushover: true,
			teams: true,
		},
	});

	const typeEmoji = payload.Type === "CPU" ? "🔲" : "💾";
	const typeColor = 0xff0000; // Rojo para indicar alerta

	for (const notification of notificationList) {
		const { discord, telegram, slack, custom, lark, pushover, teams } =
			notification;

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

		if (custom) {
			await sendCustomNotification(custom, {
				title: `Server ${payload.Type} Alert`,
				message: payload.Message,
				serverName: payload.ServerName,
				type: payload.Type,
				currentValue: payload.Value,
				threshold: payload.Threshold,
				timestamp: date.toISOString(),
				date: date.toLocaleString(),
				status: "alert",
				alertType: "server-threshold",
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
							content: `⚠️ Server ${payload.Type} Alert`,
						},
						subtitle: {
							tag: "plain_text",
							content: "",
						},
						template: "red",
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
												content: `**Server Name:**\n${payload.ServerName}`,
												text_align: "left",
												text_size: "normal_v2",
											},
											{
												tag: "markdown",
												content: `**Current Value:**\n${payload.Value.toFixed(2)}%`,
												text_align: "left",
												text_size: "normal_v2",
											},
											{
												tag: "markdown",
												content: `**Alert Message:**\n${payload.Message}`,
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
												content: `**Type:**\n${payload.Type === "CPU" ? "🔲" : "💾"} ${payload.Type}`,
												text_align: "left",
												text_size: "normal_v2",
											},
											{
												tag: "markdown",
												content: `**Threshold:**\n${payload.Threshold.toFixed(2)}%`,
												text_align: "left",
												text_size: "normal_v2",
											},
											{
												tag: "markdown",
												content: `**Alert Time:**\n${date.toLocaleString()}`,
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
				`Server ${payload.Type} Alert`,
				`Server: ${payload.ServerName}\nType: ${payload.Type}\nCurrent: ${payload.Value.toFixed(2)}%\nThreshold: ${payload.Threshold.toFixed(2)}%\nMessage: ${payload.Message}\nTime: ${date.toLocaleString()}`,
			);
		}

		if (teams) {
			await sendTeamsNotification(teams, {
				title: `⚠️ Server ${payload.Type} Alert`,
				facts: [
					{ name: "Server Name", value: payload.ServerName },
					{ name: "Type", value: payload.Type },
					{ name: "Current Value", value: `${payload.Value.toFixed(2)}%` },
					{ name: "Threshold", value: `${payload.Threshold.toFixed(2)}%` },
					{ name: "Time", value: date.toLocaleString() },
					{ name: "Message", value: payload.Message },
				],
			});
		}
	}
};
