import Head from "next/head";
import { Navbar } from "./navbar";
import { NavigationTabs, type TabState } from "./navigation-tabs";

interface Props {
	children: React.ReactNode;
	tab: TabState;
	metaName?: string;
}

export const DashboardLayout = ({ children, tab, metaName }: Props) => {
	return (
		<>
			<Head>
				<title>
					{metaName ?? tab.charAt(0).toUpperCase() + tab.slice(1)} | Dokploy
				</title>
			</Head>
			<div>
				<div
					className="relative flex min-h-screen w-full flex-col bg-background bg-radial"
					id="app-container"
				>
					<Navbar />
					<main className="flex w-full flex-col items-center pt-6">
						<div className="w-full max-w-8xl px-4 lg:px-8">
							<NavigationTabs tab={tab}>{children}</NavigationTabs>
						</div>
					</main>
				</div>
			</div>
		</>
	);
};
