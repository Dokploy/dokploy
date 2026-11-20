import type {
	custom,
	discord,
	email,
	gotify,
	lark,
	mattermost,
	ntfy,
	pushover,
	resend,
	slack,
	teams,
	telegram,
} from "@dokploy/server/db/schema";
import {
	PROVIDER_REQUEST_TIMEOUT_MS,
	providerFetch,
} from "@dokploy/server/services/logs-and-metrics/provider-fetch";
import nodemailer from "nodemailer";
import { Resend } from "resend";

export const sendEmailNotification = async (
	connection: typeof email.$inferInsert,
	subject: string,
	htmlContent: string,
	attachments?: { filename: string; content: Buffer }[],
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
			connectionTimeout: 30_000,
			greetingTimeout: 30_000,
			socketTimeout: 60_000,
		});

		await transporter.sendMail({
			from: fromAddress,
			to: toAddresses.join(", "),
			subject,
			html: htmlContent,
			textEncoding: "base64",
			attachments,
		});
	} catch (err) {
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

		const options = {
			headers: {},
			signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
		};
		const result = await client.emails.send(
			{
				from: connection.fromAddress,
				to: connection.toAddresses,
				subject,
				html: htmlContent,
			},
			options,
		);

		if (result.error) {
			throw new Error(result.error.message);
		}
	} catch (err) {
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
		const response = await providerFetch(connection.webhookUrl, {
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
		throw new Error(
			`Failed to send discord notification ${err instanceof Error ? err.message : "Unknown error"}`,
		);
	}
};

export const escapeHtml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const formatTelegramErrorMessage = (errorMessage: string) => {
	const escaped = escapeHtml(errorMessage);
	const limit = 3000;
	if (escaped.length <= limit) return escaped;
	let end = limit;
	const ampIdx = escaped.lastIndexOf("&", end);
	if (ampIdx !== -1 && escaped.indexOf(";", ampIdx) >= end) {
		end = ampIdx;
	}
	if (
		end > 0 &&
		end < escaped.length &&
		isHighSurrogate(escaped.charCodeAt(end - 1))
	) {
		end--;
	}
	return `${escaped.substring(0, end)}…`;
};

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

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
		const response = await fetch(url, {
			signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
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
		if (!response.ok) {
			const body = await response.text();
			throw new Error(
				`Failed to send telegram notification: ${response.status} ${body}`,
			);
		}
	} catch (err) {
		throw new Error(
			`Failed to send telegram notification ${err instanceof Error ? err.message : "Unknown error"}`,
		);
	}
};

export const sendSlackNotification = async (
	connection: typeof slack.$inferInsert,
	message: any,
) => {
	try {
		const response = await providerFetch(connection.webhookUrl, {
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
	const response = await providerFetch(`${connection.serverUrl}/message`, {
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
	const response = await providerFetch(
		`${connection.serverUrl}/${connection.topic}`,
		{
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
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to send ntfy notification: ${response.statusText}`);
	}
};

export const sendMattermostNotification = async (
	connection: typeof mattermost.$inferInsert,
	message: any,
) => {
	const payload = {
		...message,
		// Only include username if it's provided and not empty
		...(message.username?.trim() && { username: message.username }),
		// Only include channel if it's provided and not empty
		...(message.channel?.trim() && {
			channel: `#${message.channel.replace("#", "")}`,
		}),
	};

	const response = await providerFetch(connection.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(
			`Failed to send Mattermost notification: ${response.statusText}`,
		);
	}
};

export const sendCustomNotification = async (
	connection: typeof custom.$inferInsert,
	payload: Record<string, any>,
) => {
	const response = await providerFetch(connection.endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...connection.headers,
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		throw new Error(
			`Failed to send custom notification ${response.statusText}`,
		);
	}

	return response;
};

export const sendLarkNotification = async (
	connection: typeof lark.$inferInsert,
	message: any,
) => {
	const response = await providerFetch(connection.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(message),
	});
	if (!response.ok) {
		throw new Error(`Failed to send Lark notification: ${response.status}`);
	}
	const result = await response.json();
	if ((result.code ?? result.StatusCode) !== 0) {
		throw new Error("Lark rejected the notification");
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

		const response = await providerFetch(connection.webhookUrl, {
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
		signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		throw new Error(
			`Failed to send Pushover notification: ${response.statusText}`,
		);
	}
};
