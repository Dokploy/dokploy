export const Languages = {
	english: { code: "en", name: "English" },
	polish: { code: "pl", name: "Polski" },
	russian: { code: "ru", name: "Русский" },
	french: { code: "fr", name: "Français" },
	german: { code: "de", name: "Deutsch" },
	chineseTraditional: { code: "zh-Hant", name: "繁體中文" },
	chineseSimplified: { code: "zh-Hans", name: "简体中文" },
	turkish: { code: "tr", name: "Türkçe" },
	kazakh: { code: "kz", name: "Қазақ" },
	persian: { code: "fa", name: "فارسی" },
	korean: { code: "ko", name: "한국어" },
	portuguese: { code: "pt-br", name: "Português" },
	italian: { code: "it", name: "Italiano" },
	japanese: { code: "ja", name: "日本語" },
	spanish: { code: "es", name: "Español" },
	norwegian: { code: "no", name: "Norsk" }, 
};

export type Language = keyof typeof Languages;
export type LanguageCode = (typeof Languages)[keyof typeof Languages]["code"];
