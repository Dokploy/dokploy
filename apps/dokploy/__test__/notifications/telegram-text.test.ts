import {
	escapeTelegramHtml,
	TELEGRAM_MAX_MESSAGE_LENGTH,
	truncateTelegramText,
} from "@dokploy/server/utils/notifications/telegram-text";
import { describe, expect, it, vi } from "vitest";

describe("escapeTelegramHtml", () => {
	it("escapes markup characters from build output", () => {
		expect(escapeTelegramHtml("expected ';' before '<' token & more")).toBe(
			"expected ';' before '&lt;' token &amp; more",
		);
	});

	it("escapes ampersands before introducing new ones", () => {
		expect(escapeTelegramHtml("&<")).toBe("&amp;&lt;");
	});
});

describe("truncateTelegramText", () => {
	it("leaves short text untouched", () => {
		expect(truncateTelegramText("short error")).toBe("short error");
	});

	it("truncates long text with an ellipsis", () => {
		const long = "x".repeat(5000);
		const result = truncateTelegramText(long);
		expect(result.length).toBe(801);
		expect(result.endsWith("…")).toBe(true);
	});

	it("never leaves a dangling HTML entity at the cut point", () => {
		// An entity starting just before the 800-char cut: "&amp;" begins at
		// index 798, so a naive cut lands mid-entity at "&am".
		const text = `${"y".repeat(798)}&amp;${"z".repeat(5000)}`;
		const result = truncateTelegramText(text);
		expect(result).toBe(`${"y".repeat(798)}…`);
	});

	it("keeps a full build-error payload under Telegram's message limit", () => {
		const pathologicalError = "&<>".repeat(2000);
		const errorText = truncateTelegramText(
			escapeTelegramHtml(pathologicalError),
		);
		const message = `<b>⚠️ Build Failed</b>\n\n<b>Project:</b> p\n<b>Application:</b> a\n<b>Type:</b> docker-compose\n<b>Date:</b> Sep 9, 2026\n<b>Time:</b> 2:00:00 AM\n\n<b>Error:</b>\n<pre>${errorText}</pre>`;
		expect(message.length).toBeLessThan(TELEGRAM_MAX_MESSAGE_LENGTH);
		expect(errorText.includes("<")).toBe(false);
	});
});

describe("truncateTelegramText surrogate safety", () => {
	it("never leaves a dangling high surrogate at the cut", () => {
		// 11 BMP chars + emoji (2 UTF-16 units) straddling the cut at 12
		const text = "01234567890🚀tail";
		const out = truncateTelegramText(text, 12);
		const body = out.slice(0, -1); // strip the ellipsis
		const lastCode = body.charCodeAt(body.length - 1);
		expect(lastCode >= 0xd800 && lastCode <= 0xdbff).toBe(false);
	});
});

describe("sendTelegramNotification delivery result", () => {
	it("resolves false when Telegram rejects the message", async () => {
		const { sendTelegramNotification } = await import(
			"@dokploy/server/utils/notifications/utils"
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 400,
				text: async () => "Bad Request: message text is empty",
			})),
		);
		const ok = await sendTelegramNotification({ chatId: "1" } as never, "test");
		expect(ok).toBe(false);
		vi.unstubAllGlobals();
	});

	it("resolves true on a 2xx response", async () => {
		const { sendTelegramNotification } = await import(
			"@dokploy/server/utils/notifications/utils"
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({ ok: true, status: 200, text: async () => "" })),
		);
		const ok = await sendTelegramNotification({ chatId: "1" } as never, "test");
		expect(ok).toBe(true);
		vi.unstubAllGlobals();
	});
});
