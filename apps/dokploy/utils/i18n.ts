import type { NextApiRequestCookies } from "next/dist/server/api-utils";

export function getLocale(cookies: NextApiRequestCookies) {
	const locale = cookies.DOKPLOY_LOCALE ?? "en";
	return locale;
}

// libs/i18n.js
import { serverSideTranslations as originalServerSideTranslations } from "next-i18next/serverSideTranslations";
import nextI18NextConfig from "../next-i18next.config.cjs";

export const serverSideTranslations = (
	locale: string,
	namespaces = ["common"],
) => originalServerSideTranslations(locale, namespaces, nextI18NextConfig);
