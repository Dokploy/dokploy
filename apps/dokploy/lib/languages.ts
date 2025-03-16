import {
	enUS,
	zhCN,
	zhHK,
	pl,
	uk,
	ru,
	fr,
	de,
	tr,
	ko,
	ptBR,
	it,
	ja,
	es,
	az,
	id,
	kk,
	faIR,
	nb,
} from "date-fns/locale";

export const Languages = {
	english: { code: "en", name: "English", dateFnsLocale: enUS },
	polish: { code: "pl", name: "Polski", dateFnsLocale: pl },
	ukrainian: { code: "uk", name: "Українська", dateFnsLocale: uk },
	russian: { code: "ru", name: "Русский", dateFnsLocale: ru },
	french: { code: "fr", name: "Français", dateFnsLocale: fr },
	german: { code: "de", name: "Deutsch", dateFnsLocale: de },
	chineseTraditional: {
		code: "zh-Hant",
		name: "繁體中文",
		dateFnsLocale: zhHK,
	},
	chineseSimplified: { code: "zh-Hans", name: "简体中文", dateFnsLocale: zhCN },
	turkish: { code: "tr", name: "Türkçe", dateFnsLocale: tr },
	kazakh: { code: "kz", name: "Қазақ", dateFnsLocale: kk },
	persian: { code: "fa", name: "فارسی", dateFnsLocale: faIR },
	korean: { code: "ko", name: "한국어", dateFnsLocale: ko },
	portuguese: { code: "pt-br", name: "Português", dateFnsLocale: ptBR },
	italian: { code: "it", name: "Italiano", dateFnsLocale: it },
	japanese: { code: "ja", name: "日本語", dateFnsLocale: ja },
	spanish: { code: "es", name: "Español", dateFnsLocale: es },
	norwegian: { code: "no", name: "Norsk", dateFnsLocale: nb },
	azerbaijani: { code: "az", name: "Azərbaycan", dateFnsLocale: az },
	indonesian: { code: "id", name: "Bahasa Indonesia", dateFnsLocale: id },
	malayalam: { code: "ml", name: "മലയാളം", dateFnsLocale: enUS },
};

export function getDateFnsLocaleByCode(code: LanguageCode) {
	const language = Object.values(Languages).find((lang) => lang.code === code);
	return language ? language.dateFnsLocale : enUS;
}

export type Language = keyof typeof Languages;
export type LanguageCode = (typeof Languages)[keyof typeof Languages]["code"];
