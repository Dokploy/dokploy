import { LocaleOptions } from "./InternationalizationKit/interface/interface";
import InternationalizationKit from "./InternationalizationKit/InternationalizationKit";
import locales from "./locales-imports";

const i18n = InternationalizationKit.getInstance({
	defaultLocale: "en-us",
	fallbackLocales: ["en-us", "zh-hans-cn"],
	localesData: locales as unknown as LocaleOptions["localesData"],
	defaultPlaceholders: {
		before: "@@",
		after: "@@",
	},
	numberFormat: {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	},
	dateTimeFormat: {
		year: "numeric",
		month: "long",
		day: "numeric",
	},
});

export default i18n;
