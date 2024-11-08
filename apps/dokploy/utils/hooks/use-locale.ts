import Cookies from "js-cookie";

const SUPPORTED_LOCALES = ["en", "zh-Hans"] as const;

type Locale = (typeof SUPPORTED_LOCALES)[number];

export default function useLocale() {
	const currentLocale = (Cookies.get("DOKPLOY_LOCALE") ?? "en") as Locale;

	const setLocale = (locale: Locale) => {
		Cookies.set("DOKPLOY_LOCALE", locale);
		window.location.reload();
	};

	return {
		locale: currentLocale,
		setLocale,
	};
}
