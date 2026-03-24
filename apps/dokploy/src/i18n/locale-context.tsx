"use client";

import * as React from "react";

import type { Locale } from "./locale";

type LocaleContextValue = {
	locale: Locale;
	setLocale: (nextLocale: Locale) => void;
};

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

export const useLocaleContext = (): LocaleContextValue => {
	const context = React.useContext(LocaleContext);
	if (!context) {
		throw new Error("useLocaleContext must be used within LocaleContext.");
	}
	return context;
};

export { LocaleContext };
