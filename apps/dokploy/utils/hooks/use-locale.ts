import Cookies from "js-cookie";
import { useRouter } from "next/router";
import type { LanguageCode } from "@/lib/languages";

export default function useLocale() {
	const router = useRouter();
	const currentLocale = (Cookies.get("DOKPLOY_LOCALE") ?? "en") as LanguageCode;

	const setLocale = (locale: LanguageCode) => {
		Cookies.set("DOKPLOY_LOCALE", locale, { expires: 365 });
		// Reload to ensure server-side translations are loaded
		// Using router.reload() to maintain current route
		router.reload();
	};

	return {
		locale: currentLocale,
		setLocale,
	};
}
