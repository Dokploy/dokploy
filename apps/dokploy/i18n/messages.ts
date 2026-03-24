import type { Locale } from "./locale";

type MessageValue = string | Messages;

interface Messages {
	[key: string]: MessageValue;
}

const mergeMessages = (source: Record<string, Messages>): Messages =>
	Object.assign({}, ...Object.values(source));

export const getMessages = async (locale: Locale): Promise<Messages> => {
	if (locale === "ru") {
		const ru = await import("@/messages/ru");
		return mergeMessages(ru);
	}

	const en = await import("@/messages/en");
	return mergeMessages(en);
};
