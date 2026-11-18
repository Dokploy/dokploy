import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ru from "./locales/ru.json";

export const LOCALE_COOKIE_NAME = "dokploy-lang";

export const SUPPORTED_LANGUAGES = [
	{ code: "en", name: "English" },
	{ code: "ru", name: "Русский" },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

function isSupportedLanguage(value: string): value is SupportedLanguage {
	return SUPPORTED_LANGUAGES.some((lang) => lang.code === value);
}

function getInitialLanguage(): SupportedLanguage {
	if (typeof window === "undefined") return "en";
	const match = window.document.cookie
		.split("; ")
		.find((row) => row.startsWith(`${LOCALE_COOKIE_NAME}=`));
	const lang = match?.split("=")[1];
	return lang && isSupportedLanguage(lang) ? lang : "en";
}

function setLanguageCookie(lang: SupportedLanguage) {
	if (typeof window === "undefined") return;
	// biome-ignore lint/suspicious/noDocumentCookie: mirrors the sidebar state cookie pattern
	window.document.cookie = `${LOCALE_COOKIE_NAME}=${lang}; path=/; max-age=${
		60 * 60 * 24 * 365
	}; samesite=lax`;
}

if (!i18next.isInitialized) {
	i18next.use(initReactI18next).init({
		resources: {
			en: { translation: en },
			ru: { translation: ru },
		},
		lng: getInitialLanguage(),
		fallbackLng: "en",
		returnNull: false,
		interpolation: {
			// React already escapes strings, so we don't need i18next to do it.
			escapeValue: false,
		},
	});

	i18next.on("languageChanged", (lng) => {
		if (!isSupportedLanguage(lng)) return;
		setLanguageCookie(lng);
		if (typeof window !== "undefined") {
			window.document.documentElement.lang = lng;
		}
	});
}

export default i18next;
