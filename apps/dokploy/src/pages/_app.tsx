import "@/styles/globals.css";

import { NextIntlClientProvider } from "next-intl";

import type { NextPage } from "next";
import type { AppProps } from "next/app";
import { JetBrains_Mono, Geist } from "next/font/google";
import dynamic from "next/dynamic";
import Head from "next/head";
import { ThemeProvider } from "next-themes";
import NextTopLoader from "nextjs-toploader";
import {
	type ReactElement,
	type ReactNode,
	useCallback,
	useEffect,
	useState,
} from "react";
import { WhitelabelingProvider } from "@/components/proprietary/whitelabeling/whitelabeling-provider";
import { Toaster } from "@/components/ui/sonner";
import { api } from "@/utils/api";
import { LocaleContext } from "@/i18n/locale-context";
import {
	DEFAULT_LOCALE,
	LOCALE_STORAGE_KEY,
	type Locale,
	resolveInitialLocale,
} from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";

const SearchCommand = dynamic(
	() =>
		import("@/components/dashboard/search-command").then(
			(module) => module.SearchCommand,
		),
	{ ssr: false },
);

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist",
	display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin", "cyrillic"],
	variable: "--font-jetbrains-mono",
	display: "swap",
	weight: ["300", "400", "500", "700"],
});

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
	const [messages, setMessages] = useState<Record<string, unknown>>(() =>
		getMessages(DEFAULT_LOCALE),
	);

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

	useEffect(() => {
		let isMounted = true;

		const loadMessages = () => {
			const nextMessages = getMessages(locale);
			if (isMounted) {
				setMessages(nextMessages);
			}
		};

		loadMessages();

		return () => {
			isMounted = false;
		};
	}, [locale]);

	return (
		<LocaleContext.Provider value={{ locale, setLocale }}>
			<NextIntlClientProvider locale={locale} messages={messages}>
				<div
					className={`${geist.variable} ${jetbrainsMono.variable} font-sans`}
				>
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
				</div>
			</NextIntlClientProvider>
		</LocaleContext.Provider>
	);
};

export default api.withTRPC(MyApp);
