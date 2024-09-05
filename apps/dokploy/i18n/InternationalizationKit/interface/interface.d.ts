import type Locales from "./locales";

export interface PlaceholdersObject {
	before: string;
	after: string;
}

export interface LocaleOptions {
	defaultLocale: string;
	fallbackLocales: string[];
	localesData: { [lang: string]: Locales | (() => Promise<Locales>) };
	numberFormat?: Intl.NumberFormatOptions;
	dateTimeFormat?: Intl.DateTimeFormatOptions;
	defaultPlaceholders?: PlaceholdersObject;
}

export interface dateTimeFormatOptions {
	locale?: string;
	dateTimeFormat?: Intl.DateTimeFormatOptions;
	date?: number | Date | undefined;
}

export interface numberFormatOptions {
	locale?: string;
	numberFormat?: Intl.NumberFormatOptions;
	value: number | bigint;
}
