import type {
	custom,
	discord,
	email,
	gotify,
	lark,
	mattermost,
	notifly,
	ntfy,
	pushover,
	resend,
	sendly,
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
			...(username && password
				? { auth: { user: username, pass: password } }
				: {}),
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

/**
 * Sendly answers 200 for an email whose subject and body match one it already
 * sent to the same recipient, but never delivers it. The send time makes every
 * test email unique, so each "Test" click really arrives.
 */
export const buildSendlyTestEmail = (now: Date = new Date()) => {
	const sentAt = now.toISOString().replace("T", " ").slice(0, 19);
	return {
		subject: `Test Email (${sentAt} UTC)`,
		html: `<p>Hi, From Dokploy 👋</p><p>Sent at ${sentAt} UTC.</p>`,
	};
};

export const sendSendlyNotification = async (
	connection: typeof sendly.$inferInsert,
	subject: string,
	htmlContent: string,
) => {
	try {
		const baseUrl = connection.baseUrl || "https://app.sendly.now";

		const response = await fetch(`${baseUrl}/api/emails`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${connection.apiKey}`,
			},
			body: JSON.stringify({
				from: connection.fromAddress,
				to: connection.toAddresses,
				subject,
				body: htmlContent,
			}),
		});

		if (!response.ok) {
			const data = await response.json().catch(() => null);
			throw new Error(
				data?.error?.message ||
					`Failed to send Sendly notification: ${response.statusText}`,
			);
		}
	} catch (err) {
		console.log(err);
		throw new Error(
			`Failed to send Sendly notification ${err instanceof Error ? err.message : "Unknown error"}`,
		);
	}
};

const NOTIFLY_ERROR_MAX_LENGTH = 200;

const capText = (text: string, max: number) =>
	text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * Pulls the human message out of a Notifly error body: `{"message": "..."}`
 * (a string or a list of strings), `{"error": {"message": "..."}}` or
 * `{"error": "..."}`; anything that is not JSON is used as plain text.
 */
const notiflyErrorDetail = (body: string) => {
	const text = body.trim();
	if (!text) return "";
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return text;
	}
	if (!parsed || typeof parsed !== "object") return text;
	const { message, error } = parsed as {
		message?: unknown;
		error?: unknown;
	};
	const pick = (value: unknown): string | null => {
		if (typeof value === "string" && value.trim()) return value.trim();
		if (Array.isArray(value)) {
			const joined = value.filter((v) => typeof v === "string").join(", ");
			return joined || null;
		}
		return null;
	};
	return (
		pick(message) ??
		pick((error as { message?: unknown } | null)?.message) ??
		pick(error) ??
		""
	);
};

/**
 * One short line for a failed Notifly call, e.g. `Notifly rejected the API key
 * (API Key not found)`: the upstream JSON is parsed (never dumped raw) and the
 * detail is length-capped.
 */
export const buildNotiflyErrorMessage = (response: {
	status?: number;
	statusText?: string;
	body: string;
}) => {
	const detail = capText(
		notiflyErrorDetail(response.body),
		NOTIFLY_ERROR_MAX_LENGTH,
	);
	if (response.status === 401) {
		return detail
			? `Notifly rejected the API key (${detail})`
			: "Notifly rejected the API key";
	}
	const label = [response.status, response.statusText]
		.filter(Boolean)
		.join(" ");
	const head = label
		? `Notifly request failed (${label})`
		: "Notifly request failed";
	return detail ? `${head}: ${detail}` : head;
};

class NotiflyRequestError extends Error {}

export const sendNotiflyNotification = async (
	connection: typeof notifly.$inferInsert,
	payload: Record<string, any>,
) => {
	try {
		const baseUrl = connection.baseUrl || "https://api.notifly.io";

		const response = await fetch(`${baseUrl}/v1/events/trigger`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `ApiKey ${connection.apiKey}`,
			},
			body: JSON.stringify({
				name: connection.workflowKey,
				to: connection.subscriberId || "dokploy",
				payload,
			}),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new NotiflyRequestError(
				buildNotiflyErrorMessage({
					status: response.status,
					statusText: response.statusText,
					body,
				}),
			);
		}
	} catch (err) {
		console.log(err);
		// Already a finished one-line message: do not wrap it a second time.
		if (err instanceof NotiflyRequestError) throw err;
		throw new Error(
			`Could not reach Notifly: ${err instanceof Error ? err.message : "Unknown error"}`,
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

	const response = await fetch(connection.webhookUrl, {
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
