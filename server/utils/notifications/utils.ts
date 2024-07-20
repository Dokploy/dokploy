import type { discord, email, slack, telegram } from "@/server/db/schema";
import nodemailer from "nodemailer";

export const sendEmailNotification = async (
	connection: typeof email.$inferInsert,
	subject: string,
	htmlContent: string,
) => {
	const { smtpServer, smtpPort, username, password, fromAddress, toAddresses } =
		connection;
	const transporter = nodemailer.createTransport({
		host: smtpServer,
		port: smtpPort,
		secure: smtpPort === 465,
		auth: { user: username, pass: password },
	});

	await transporter.sendMail({
		from: fromAddress,
		to: toAddresses.join(", "),
		subject,
		html: htmlContent,
	});
};

export const sendDiscordNotification = async (
	connection: typeof discord.$inferInsert,
	embed: any,
) => {
	const response = await fetch(connection.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ embeds: [embed] }),
	});

	if (!response.ok) throw new Error("Failed to send Discord notification");
};

export const sendTelegramNotification = async (
	connection: typeof telegram.$inferInsert,
	messageText: string,
) => {
	const url = `https://api.telegram.org/bot${connection.botToken}/sendMessage`;
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			chat_id: connection.chatId,
			text: messageText,
			parse_mode: "HTML",
			disable_web_page_preview: true,
		}),
	});

	if (!response.ok) throw new Error("Failed to send Telegram notification");
};

export const sendSlackNotification = async (
	connection: typeof slack.$inferInsert,
	message: any,
) => {
	const response = await fetch(connection.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(message),
	});

	if (!response.ok) throw new Error("Failed to send Slack notification");
};
