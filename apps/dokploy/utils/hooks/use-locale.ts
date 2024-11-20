import Cookies from "js-cookie";

const SUPPORTED_LOCALES = ["en", "pl", "ru", "de", "zh-Hans"] as const;

type Locale = (typeof SUPPORTED_LOCALES)[number];

export default function useLocale() {
	const currentLocale = (Cookies.get("DOKPLOY_LOCALE") ?? "en") as Locale;

	const setLocale = (locale: Locale) => {
		Cookies.set("DOKPLOY_LOCALE", locale, { expires: 365 });
		window.location.reload();
	};

	return {
		locale: currentLocale,
		setLocale,
	};
}
