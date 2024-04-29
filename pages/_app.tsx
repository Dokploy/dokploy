import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import { api } from "@/utils/api";
import type { NextPage } from "next";
import { ThemeProvider } from "next-themes";
import type { AppProps } from "next/app";
import Head from "next/head";
import type { ReactElement, ReactNode } from "react";

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
