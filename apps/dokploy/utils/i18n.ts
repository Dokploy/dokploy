import type { NextApiRequestCookies } from "next/dist/server/api-utils";

export function getLocale(cookies: NextApiRequestCookies) {
	const locale = cookies.DOKPLOY_LOCALE ?? "en";
	return locale;
}

export { serverSideTranslations } from "next-i18next/serverSideTranslations";
