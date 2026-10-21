import { sendTelegramNotification } from "@dokploy/server/utils/notifications/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connection = {
	botToken: "test-token",
	chatId: "-100123",
	messageThreadId: "42",
};

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
	vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("Telegram direct transport", () => {
	it.each([undefined, null, "", "   "])(
		"keeps direct fetch when proxyUrl is %s",
		async (proxyUrl) => {
			const buttons = [[{ text: "Open", url: "https://dokploy.example.com" }]];
			await sendTelegramNotification(
				{ ...connection, proxyUrl },
				"<b>Ready</b>",
				buttons,
			);
			expect(fetch).toHaveBeenCalledExactlyOnceWith(
				"https://api.telegram.org/bottest-token/sendMessage",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chat_id: "-100123",
						message_thread_id: "42",
						text: "<b>Ready</b>",
						parse_mode: "HTML",
						disable_web_page_preview: true,
						reply_markup: { inline_keyboard: buttons },
					}),
				},
			);
		},
	);

	it("keeps status and response body in Telegram API errors", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response("bad chat", { status: 400 }),
		);
		await expect(sendTelegramNotification(connection, "hi")).rejects.toThrow(
			"Failed to send telegram notification: 400 bad chat",
		);
	});

	it("keeps direct network errors", async () => {
		vi.mocked(fetch).mockRejectedValue(new Error("network unavailable"));
		await expect(sendTelegramNotification(connection, "hi")).rejects.toThrow(
			"Failed to send telegram notification network unavailable",
		);
	});

	it.each(["http://proxy.example.com:8080", "socks4://proxy.example.com"])(
		"rejects unsupported proxy %s without falling back to fetch",
		async (proxyUrl) => {
			await expect(
				sendTelegramNotification({ ...connection, proxyUrl }, "hi"),
			).rejects.toThrow("Telegram proxy must use SOCKS5");
			expect(fetch).not.toHaveBeenCalled();
		},
	);
});
