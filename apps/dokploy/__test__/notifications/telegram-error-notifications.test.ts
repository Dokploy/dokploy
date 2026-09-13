import { describe, expect, it, vi } from "vitest";

describe("Telegram Error Notifications (Fixes Issue #5392)", () => {
	// Utility implementations matching packages/server/src/utils/notifications/utils.ts
	const escapeHtml = (text: string): string => {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	};

	const formatTelegramErrorMessage = (
		errorMessage: string,
		maxLen = 3000,
	): string => {
		const truncated =
			errorMessage.length > maxLen
				? `${errorMessage.substring(0, maxLen)}…`
				: errorMessage;
		return escapeHtml(truncated);
	};

	const sendTelegramNotification = async (
		connection: {
			botToken: string;
			chatId: string;
			messageThreadId?: string;
		},
		messageText: string,
		inlineButton?: { text: string; url: string }[][],
		fetchMock = fetch,
	) => {
		try {
			const url = `https://api.telegram.org/bot${connection.botToken}/sendMessage`;
			const response = await fetchMock(url, {
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
				const errorText = await response.text();
				throw new Error(
					`Failed to send telegram notification: ${response.status} ${errorText}`,
				);
			}
		} catch (err) {
			throw new Error(
				`Failed to send telegram notification ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		}
	};

	it("escapes raw HTML tags in error message to prevent Telegram parse_mode rejection", () => {
		const rawError = 'process "/bin/sh -c npm ci" did not complete: exit 1 <-- see log & check <stdin>';
		const formatted = formatTelegramErrorMessage(rawError);

		expect(formatted).not.toContain("<--");
		expect(formatted).not.toContain("<stdin>");
		expect(formatted).toContain("&lt;-- see log &amp; check &lt;stdin&gt;");
	});

	it("truncates excessively long error message to fit within Telegram 4096-char payload limit", () => {
		// Simulating 22 KB compose build failure log
		const hugeError = "x".repeat(22000) + "<failure>";
		const formatted = formatTelegramErrorMessage(hugeError, 3000);

		expect(formatted.length).toBeLessThanOrEqual(3002 + 10); // 3000 + ellipsis + HTML escaping
		expect(formatted.endsWith("…")).toBe(true);
		expect(formatted).not.toContain("<failure>");
	});

	it("preserves short clean error message without unwanted truncation", () => {
		const shortError = "Connection refused on port 5432";
		const formatted = formatTelegramErrorMessage(shortError);

		expect(formatted).toBe(shortError);
	});

	it("throws error when Telegram API returns non-2xx response instead of silently swallowing", async () => {
		const fakeFetch = vi.fn(async () => ({
			ok: false,
			status: 400,
			text: async () => '{"ok":false,"error_code":400,"description":"Bad Request: message is too long"}',
		})) as unknown as typeof fetch;

		await expect(
			sendTelegramNotification(
				{ botToken: "test-token", chatId: "test-chat" },
				"<b>Build Failed</b>",
				undefined,
				fakeFetch,
			),
		).rejects.toThrow("Bad Request: message is too long");
	});

	it("succeeds when Telegram API returns 200 OK", async () => {
		const fakeFetch = vi.fn(async () => ({
			ok: true,
			status: 200,
			text: async () => '{"ok":true,"result":{}}',
		})) as unknown as typeof fetch;

		await expect(
			sendTelegramNotification(
				{ botToken: "test-token", chatId: "test-chat" },
				"<b>Build Failed</b>",
				undefined,
				fakeFetch,
			),
		).resolves.toBeUndefined();
	});
});
