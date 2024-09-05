import "@/styles/globals.css";

import { Toaster } from "@/components/ui/sonner";
import i18n from "@/i18n";
import { type Storefront, storefronts } from "@/i18n/storefronts";
import { api } from "@/utils/api";
import type { NextPage } from "next";
import { ThemeProvider } from "next-themes";
import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement, ReactNode } from "react";

const inter = Inter({ subsets: ["latin"] });

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
	getLayout?: (page: ReactElement) => ReactNode;
	// session: Session | null;
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
	const {
		query: { locale },
	} = useRouter();
	const storefront = storefronts.find(
		(item) => item.id === locale,
	) as Storefront;

	i18n.setLocale(storefront?.attributes.defaultLanguageTag.toLocaleLowerCase());
	return (
		<>
			<style jsx global>{`
        :root {
          --font-inter: ${inter.style.fontFamily};
        }
      `}</style>
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
				<Toaster richColors />
				{getLayout(<Component {...pageProps} />)}
			</ThemeProvider>
		</>
	);
};

export default api.withTRPC(MyApp);
