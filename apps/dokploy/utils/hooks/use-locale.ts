import Cookies from "js-cookie";

const SUPPORTED_LOCALES = ["en", "zh-Hans"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];
type PossibleLocale = (typeof SUPPORTED_LOCALES)[number] | undefined | null;

export default function useLocale() {
	const currentLocale = Cookies.get("DOKPLOY_LOCALE") as PossibleLocale;

	console.log(currentLocale);

	const setLocale = (locale: Locale) => {
		Cookies.set("DOKPLOY_LOCALE", locale);
		window.location.reload();
	};

	return {
		locale: currentLocale,
		setLocale,
	};
}
