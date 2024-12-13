import "@/styles/globals.css";

import { Toaster } from "@/components/ui/sonner";
import { Languages } from "@/lib/languages";
import { api } from "@/utils/api";
import type { NextPage } from "next";
import { appWithTranslation } from "next-i18next";
import { ThemeProvider } from "next-themes";
import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Head from "next/head";
import Script from "next/script";
import type { ReactElement, ReactNode } from "react";
import { SearchCommand } from "@/components/dashboard/search-command";

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
  appWithTranslation(
    MyApp,
    // keep this in sync with next-i18next.config.js
    // if you want to know why don't just import the config file, this because next-i18next.config.js must be a CJS, but the rest of the code is ESM.
    // Add the config here is due to the issue: https://github.com/i18next/next-i18next/issues/2259
    // if one day every page is translated, we can safely remove this config.
    {
      i18n: {
        defaultLocale: "en",
        locales: Object.values(Languages),
        localeDetection: false,
      },
      fallbackLng: "en",
      keySeparator: false,
    }
  )
);
