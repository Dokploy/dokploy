/**
 * Helpers for Telegram's HTML parse_mode payloads.
 *
 * Telegram answers sendMessage with HTTP 400 when the text exceeds 4096
 * characters or when its HTML fails to parse, and in both cases the message
 * is simply never delivered - so dynamic content must be escaped and kept
 * well under the length limit.
 */

/** Maximum length of a Telegram message text. */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/** Escapes the characters Telegram's HTML parse_mode treats as markup. */
export const escapeTelegramHtml = (text: string): string =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Truncates already-escaped text, backing off from a cut that would split an
 * HTML entity (a dangling "&" is itself a parse error under parse_mode=HTML).
 */
export const truncateTelegramText = (
	escapedText: string,
	maxLength = 800,
): string => {
	if (escapedText.length <= maxLength) {
		return escapedText;
	}

	let truncated = escapedText.substring(0, maxLength);
	const lastAmpersand = truncated.lastIndexOf("&");
	if (lastAmpersand > truncated.lastIndexOf(";")) {
		truncated = truncated.substring(0, lastAmpersand);
	}

	return `${truncated}…`;
};
