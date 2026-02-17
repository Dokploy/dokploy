import type {
	custom,
	discord,
	email,
	gotify,
	lark,
	ntfy,
	pushover,
	resend,
	slack,
	teams,
	telegram,
} from "@dokploy/server/db/schema";
import nodemailer from "nodemailer";
import { Resend } from "resend";

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
			textEncoding: "base64",
		});
	} catch (err) {
		console.log(err);
		throw new Error(
			`Failed to send email notification ${err instanceof Error ? err.message : "Unknown error"}`,
		);
	}
};

export const sendResendNotification = async (
	connection: typeof resend.$inferInsert,
	subject: string,
	htmlContent: string,
) => {
	try {
		const client = new Resend(connection.apiKey);

		const result = await client.emails.send({
			from: connection.fromAddress,
			to: connection.toAddresses,
			subject,
			html: htmlContent,
		});

		if (result.error) {
			throw new Error(result.error.message);
		}
	} catch (err) {
		console.log(err);
		throw new Error(
			`Failed to send Resend notification ${err instanceof Error ? err.message : "Unknown error"}`,
		);
	}
};

export const sendDiscordNotification = async (
	connection: typeof discord.$inferInsert,
	embed: any,
) => {
	try {
		const response = await fetch(connection.webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ embeds: [embed] }),
		});
		if (!response.ok) {
			throw new Error(
				`Failed to send discord notification ${response.statusText}`,
			);
		}
	} catch (err) {
		console.log("error", err);
		throw new Error(
			`Failed to send discord notification ${err instanceof Error ? err.message : "Unknown error"}`,
		);
	}
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
		const response = await fetch(connection.webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(message),
		});
		if (!response.ok) {
			throw new Error(
				`Failed to send slack notification ${response.statusText}`,
			);
		}
	} catch (err) {
		console.log("error", err);
		throw new Error(
			`Failed to send slack notification ${err instanceof Error ? err.message : "Unknown error"}`,
		);
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

export const sendNtfyNotification = async (
	connection: typeof ntfy.$inferInsert,
	title: string,
	tags: string,
	actions: string,
	message: string,
) => {
	const response = await fetch(`${connection.serverUrl}/${connection.topic}`, {
		method: "POST",
		headers: {
			...(connection.accessToken && {
				Authorization: `Bearer ${connection.accessToken}`,
			}),
			"X-Priority": connection.priority?.toString() || "3",
			"X-Title": title,
			"X-Tags": tags,
			"X-Actions": actions,
		},
		body: message,
	});

	if (!response.ok) {
		throw new Error(`Failed to send ntfy notification: ${response.statusText}`);
	}
};

export const sendCustomNotification = async (
	connection: typeof custom.$inferInsert,
	payload: Record<string, any>,
) => {
	try {
		// Merge default headers with custom headers (now already an object from jsonb)
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			...(connection.headers || {}),
		};

		// Default body with payload
		const body = JSON.stringify(payload);

		const response = await fetch(connection.endpoint, {
			method: "POST",
			headers,
			body,
		});

		if (!response.ok) {
			throw new Error(
				`Failed to send custom notification: ${response.statusText}`,
			);
		}

		return response;
	} catch (error) {
		console.error("Error sending custom notification:", error);
		throw error;
	}
};

export const sendLarkNotification = async (
	connection: typeof lark.$inferInsert,
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

export interface TeamsAdaptiveCardMessage {
	title: string;
	themeColor?: string;
	facts?: { name: string; value: string }[];
	potentialAction?: { type: "Action.OpenUrl"; title: string; url: string };
}

export const sendTeamsNotification = async (
	connection: typeof teams.$inferInsert,
	message: TeamsAdaptiveCardMessage,
) => {
	try {
		const bodyElements: Record<string, unknown>[] = [
			{
				type: "TextBlock",
				text: message.title,
				size: "Medium",
				weight: "Bolder",
				wrap: true,
			},
		];

		if (message.facts && message.facts.length > 0) {
			bodyElements.push({
				type: "FactSet",
				facts: message.facts.map((f) => ({
					title: f.name,
					value: f.value,
				})),
			});
		}

		const cardContent: Record<string, unknown> = {
			type: "AdaptiveCard",
			$schema: "http://adaptivecards.io/schemas/adaptive-card.json",
			version: "1.4",
			body: bodyElements,
		};

		if (message.potentialAction) {
			cardContent.actions = [
				{
					type: "Action.OpenUrl",
					title: message.potentialAction.title,
					url: message.potentialAction.url,
				},
			];
		}

		const payload = {
			type: "message",
			attachments: [
				{
					contentType: "application/vnd.microsoft.card.adaptive",
					content: cardContent,
				},
			],
		};

		const response = await fetch(connection.webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error(
				`Failed to send Teams notification: ${response.statusText}`,
			);
		}
	} catch (err) {
		console.log(err);
		throw new Error(
			`Failed to send Teams notification ${err instanceof Error ? err.message : "Unknown error"}`,
		);
	}
};

export const sendPushoverNotification = async (
	connection: typeof pushover.$inferInsert,
	title: string,
	message: string,
) => {
	const formData = new URLSearchParams();
	formData.append("token", connection.apiToken);
	formData.append("user", connection.userKey);
	formData.append("title", title);
	formData.append("message", message);
	formData.append("priority", connection.priority?.toString() || "0");

	// For emergency priority (2), retry and expire are required
	if (connection.priority === 2) {
		formData.append("retry", connection.retry?.toString() || "30");
		formData.append("expire", connection.expire?.toString() || "3600");
	}

	const response = await fetch("https://api.pushover.net/1/messages.json", {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		throw new Error(
			`Failed to send Pushover notification: ${response.statusText}`,
		);
	}
};
