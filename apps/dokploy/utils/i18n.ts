import type { NextApiRequestCookies } from "next/dist/server/api-utils";

export function getLocale(cookies: NextApiRequestCookies) {
	const locale = cookies.DOKPLOY_LOCALE ?? "en";
	return locale;
}

import { serverSideTranslations as originalServerSideTranslations } from "next-i18next/serverSideTranslations";
import { Languages } from "@/lib/languages";

export const serverSideTranslations = (
	locale: string,
	namespaces = ["common"],
) =>
	originalServerSideTranslations(locale, namespaces, {
		fallbackLng: "en",
		keySeparator: false,
		i18n: {
			defaultLocale: "en",
			locales: Object.values(Languages).map((language) => language.code),
			localeDetection: false,
		},
	});
