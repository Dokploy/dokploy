export type Locale = "ru" | "en";

export const LOCALE_STORAGE_KEY = "locale";
export const DEFAULT_LOCALE: Locale = "ru";
export const FALLBACK_LOCALE: Locale = "en";

export const isLocale = (value: unknown): value is Locale =>
	value === "ru" || value === "en";

const normalizeAcceptLanguage = (value: string): Locale | null => {
	const normalized = value.trim().toLowerCase();
	if (normalized.startsWith("ru")) return "ru";
	if (normalized.startsWith("en")) return "en";
	return null;
};

export const getLocaleFromLocalStorage = (): Locale | null => {
	if (typeof window === "undefined") return null;

	try {
		const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
		if (!stored) return null;
		return isLocale(stored) ? stored : null;
	} catch {
		return null;
	}
};

export const getLocaleFromAcceptLanguage = (): Locale | null => {
	if (typeof window === "undefined") return null;

	const acceptLanguage =
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		(navigator.languages?.[0] ?? navigator.language) || "";

	if (!acceptLanguage) return null;
	return normalizeAcceptLanguage(acceptLanguage);
};

/**
 * Order:
 * 1) localStorage (user choice)
 * 2) Accept-Language (browser)
 * 3) fallback to ru
 */
export const resolveInitialLocale = (): Locale => {
	return (
		getLocaleFromLocalStorage() ??
		getLocaleFromAcceptLanguage() ??
		DEFAULT_LOCALE
	);
};

