import "@/styles/globals.css";

import type { NextPage } from "next";
import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import NextTopLoader from "nextjs-toploader";
import type { ReactElement, ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { SearchCommand } from "@/components/dashboard/search-command";
import { Analytics } from "@/components/shared/analytics";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import i18n from "@/lib/i18n/config";
import { api } from "@/utils/api";

const inter = Inter({ subsets: ["latin"] });

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
	getLayout?: (page: ReactElement) => ReactNode;
	theme?: string;
};

type AppPropsWithLayout = AppProps & {
	Component: NextPageWithLayout;
};

const AppProviders = ({ children }: { children: ReactNode }) => {
	useTranslation();

	return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
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
			<TooltipProvider>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
					forcedTheme={Component.theme}
				>
					<AppProviders>
						<NextTopLoader color="hsl(var(--sidebar-ring))" />
						<Analytics />
						<Toaster richColors />
						<SearchCommand />
						{getLayout(<Component {...pageProps} />)}
					</AppProviders>
				</ThemeProvider>
			</TooltipProvider>
		</>
	);
};

export default api.withTRPC(MyApp);
