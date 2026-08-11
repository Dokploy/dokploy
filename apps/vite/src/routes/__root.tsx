import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { SearchCommand } from "@/components/dashboard/search-command";
import { WhitelabelingProvider } from "@/components/proprietary/whitelabeling/whitelabeling-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import TopLoader from "~/shims/toploader";

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

export const Route = createRootRoute({
	component: RootComponent,
});
