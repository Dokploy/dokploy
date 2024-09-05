import InternationalizationKit from "./InternationalizationKit/InternationalizationKit";
import type { LocaleOptions } from "./InternationalizationKit/interface/interface";
import locales from "./locales-imports";

const i18n = InternationalizationKit.getInstance({
	defaultLocale: "en-us",
	fallbackLocales: ["en-us", "zh-hans-cn"],
	localesData: locales as unknown as LocaleOptions["localesData"],
	defaultPlaceholders: {
		before: "@@",
		after: "@@",
	},
});

export default i18n;
