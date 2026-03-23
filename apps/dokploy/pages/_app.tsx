import "@/styles/globals.css";

import { NextIntlClientProvider } from "next-intl";

import type { NextPage } from "next";
import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Head from "next/head";
import { ThemeProvider } from "next-themes";
import NextTopLoader from "nextjs-toploader";
import {
	type ReactElement,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { SearchCommand } from "@/components/dashboard/search-command";
import { WhitelabelingProvider } from "@/components/proprietary/whitelabeling/whitelabeling-provider";
import { Toaster } from "@/components/ui/sonner";
import { api } from "@/utils/api";
import { LocaleContext } from "@/i18n/locale-context";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type Locale, resolveInitialLocale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";

const inter = Inter({ subsets: ["latin"] });

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
	getLayout?: (page: ReactElement) => ReactNode;
	theme?: string;
};

type AppPropsWithLayout = AppProps & {
	Component: NextPageWithLayout;
};

const MyApp = ({
	Component,
	pageProps: { ...pageProps },
}: AppPropsWithLayout) => {
	const getLayout = Component.getLayout ?? ((page) => page);

	const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

	useEffect(() => {
		setLocaleState(resolveInitialLocale());
	}, []);

	const setLocale = useCallback(
		(nextLocale: Locale) => {
			if (typeof window !== "undefined") {
				try {
					window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
				} catch {}
			}
			setLocaleState(nextLocale);
		},
		[setLocaleState],
	);

	const messages = useMemo(() => getMessages(locale), [locale]);

	return (
		<LocaleContext.Provider value={{ locale, setLocale }}>
			<NextIntlClientProvider locale={locale} messages={messages}>
				<>
					<style jsx global>
						{`
							:root {
								--font-inter: ${inter.style.fontFamily};
							}
						`}
					</style>
					<Head>
						<title>Dokploy</title>
					</Head>
					<ThemeProvider
						attribute="class"
						defaultTheme="system"
						enableSystem
						disableTransitionOnChange
						forcedTheme={Component.theme}
					>
						<NextTopLoader color="hsl(var(--sidebar-ring))" />
						<WhitelabelingProvider />
						<Toaster richColors />
						<SearchCommand />
						{getLayout(<Component {...pageProps} />)}
					</ThemeProvider>
				</>
			</NextIntlClientProvider>
		</LocaleContext.Provider>
	);
};

export default api.withTRPC(MyApp);
