import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { SearchCommand } from "@/components/dashboard/search-command";
import { WhitelabelingProvider } from "@/components/proprietary/whitelabeling/whitelabeling-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getBrandingFn } from "~/server-fns/branding";
import TopLoader from "~/shims/toploader";
import appCss from "../styles/globals.css?url";

const RootComponent = () => {
	return (
		<TooltipProvider>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				disableTransitionOnChange
			>
				<TopLoader />
				<WhitelabelingProvider />
				<Toaster richColors />
				<SearchCommand />
				<Outlet />
			</ThemeProvider>
		</TooltipProvider>
	);
};

const RootDocument = ({ children }: { children: React.ReactNode }) => {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
};

export const Route = createRootRoute({
	loader: () => getBrandingFn(),
	head: ({ loaderData }) => {
		const branding = loaderData ?? null;
		const title = branding?.metaTitle || branding?.appName || "Dokploy";
		return {
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ title },
				{ property: "og:title", content: title },
				...(branding?.appDescription
					? [
							{ name: "description", content: branding.appDescription },
							{ property: "og:description", content: branding.appDescription },
						]
					: []),
				...(branding?.logoUrl
					? [{ property: "og:image", content: branding.logoUrl }]
					: []),
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "icon", href: branding?.faviconUrl || "/icon.svg" },
				{ rel: "preconnect", href: "https://fonts.googleapis.com" },
				{
					rel: "preconnect",
					href: "https://fonts.gstatic.com",
					crossOrigin: "anonymous",
				},
				{
					rel: "stylesheet",
					href: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
				},
			],
			styles: branding?.customCss
				? [{ children: branding.customCss }]
				: undefined,
		};
	},
	shellComponent: RootDocument,
	component: RootComponent,
});
