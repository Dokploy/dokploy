/**
 * Sorted list based off of population of the country / speakers of the language.
 */
export const Languages = {
	english: { code: "en", name: "English" },
	spanish: { code: "es", name: "Español" },
	chineseSimplified: { code: "zh-Hans", name: "简体中文" },
	chineseTraditional: { code: "zh-Hant", name: "繁體中文" },
	portuguese: { code: "pt-br", name: "Português" },
	russian: { code: "ru", name: "Русский" },
	japanese: { code: "ja", name: "日本語" },
	german: { code: "de", name: "Deutsch" },
	korean: { code: "ko", name: "한국어" },
	french: { code: "fr", name: "Français" },
	turkish: { code: "tr", name: "Türkçe" },
	italian: { code: "it", name: "Italiano" },
	polish: { code: "pl", name: "Polski" },
	ukrainian: { code: "uk", name: "Українська" },
	persian: { code: "fa", name: "فارسی" },
	dutch: { code: "nl", name: "Nederlands" },
	indonesian: { code: "id", name: "Bahasa Indonesia" },
	kazakh: { code: "kz", name: "Қазақ" },
	norwegian: { code: "no", name: "Norsk" },
	azerbaijani: { code: "az", name: "Azərbaycan" },
	malayalam: { code: "ml", name: "മലയാളം" },
};

export type Language = keyof typeof Languages;
export type LanguageCode = (typeof Languages)[keyof typeof Languages]["code"];
