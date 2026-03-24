import type { Locale } from "./locale";
import * as enMessages from "@/i18n/locales/en";
import * as ruMessages from "@/i18n/locales/ru";

type MessageValue = string | Messages;

interface Messages {
	[key: string]: MessageValue;
}

const mergeMessages = (source: Record<string, Messages>): Messages =>
	Object.assign({}, ...Object.values(source));

export const getMessages = (locale: Locale): Messages =>
	mergeMessages(locale === "ru" ? ruMessages : enMessages);
