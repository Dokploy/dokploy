import type {
	discord,
	email,
	gotify,
	slack,
	telegram,
} from "@dokploy/server/db/schema";
import nodemailer from "nodemailer";

export const sendEmailNotification = async (
	connection: typeof email.$inferInsert,
	subject: string,
	htmlContent: string,
) => {
	try {
		const {
			smtpServer,
			smtpPort,
			username,
			password,
			fromAddress,
			toAddresses,
		} = connection;
		const transporter = nodemailer.createTransport({
			host: smtpServer,
			port: smtpPort,
			auth: { user: username, pass: password },
		});

		await transporter.sendMail({
			from: fromAddress,
			to: toAddresses.join(", "),
			subject,
			html: htmlContent,
		});
	} catch (err) {
		console.log(err);
	}
};

export const sendDiscordNotification = async (
	connection: typeof discord.$inferInsert,
	embed: any,
) => {
	// try {
	await fetch(connection.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ embeds: [embed] }),
	});
	// } catch (err) {
	// 	console.log(err);
	// }
};

export const sendTelegramNotification = async (
	connection: typeof telegram.$inferInsert,
	messageText: string,
	inlineButton?: {
		text: string;
		url: string;
	}[][],
) => {
	try {
		const url = `https://api.telegram.org/bot${connection.botToken}/sendMessage`;
		await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: connection.chatId,
				message_thread_id: connection.messageThreadId,
				text: messageText,
				parse_mode: "HTML",
				disable_web_page_preview: true,
				reply_markup: {
					inline_keyboard: inlineButton,
				},
			}),
		});
	} catch (err) {
		console.log(err);
	}
};

export const sendSlackNotification = async (
	connection: typeof slack.$inferInsert,
	message: any,
) => {
	try {
		await fetch(connection.webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(message),
		});
	} catch (err) {
		console.log(err);
	}
};

export const sendGotifyNotification = async (
	connection: typeof gotify.$inferInsert,
	title: string,
	message: string,
) => {
	const response = await fetch(`${connection.serverUrl}/message`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Gotify-Key": connection.appToken,
		},
		body: JSON.stringify({
			title: title,
			message: message,
			priority: connection.priority,
			extras: {
				"client::display": {
					contentType: "text/plain",
				},
			},
		}),
	});

	if (!response.ok) {
		throw new Error(
			`Failed to send Gotify notification: ${response.statusText}`,
		);
	}
};
