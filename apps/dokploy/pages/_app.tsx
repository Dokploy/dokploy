import "@/styles/globals.css";

import type { NextPage } from "next";
import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Head from "next/head";
import Script from "next/script";
import { appWithTranslation } from "next-i18next";
import { ThemeProvider } from "next-themes";
import type { ReactElement, ReactNode } from "react";
import { SearchCommand } from "@/components/dashboard/search-command";
import { Toaster } from "@/components/ui/sonner";
import { Languages } from "@/lib/languages";
import { api } from "@/utils/api";

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

	return (
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
			{process.env.NEXT_PUBLIC_UMAMI_HOST &&
				process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
					<Script
						src={process.env.NEXT_PUBLIC_UMAMI_HOST}
						data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
					/>
				)}

			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				disableTransitionOnChange
				forcedTheme={Component.theme}
			>
				<Toaster richColors />
				<SearchCommand />
				{getLayout(<Component {...pageProps} />)}
			</ThemeProvider>
		</>
	);
};

export default api.withTRPC(
	appWithTranslation(MyApp, {
		i18n: {
			defaultLocale: "en",
			locales: Object.values(Languages).map((language) => language.code),
			localeDetection: false,
		},
		fallbackLng: "en",
		keySeparator: false,
	}),
);
