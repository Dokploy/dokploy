import { Navbar } from "./navbar";
import { NavigationTabs, type TabState } from "./navigation-tabs";

interface Props {
	children: React.ReactNode;
	tab: TabState;
}

export const DashboardLayout = ({ children, tab }: Props) => {
	return (
		<div>
			<div
				className="bg-radial relative flex flex-col bg-background pt-6"
				id="app-container"
			>
				<div className="flex items-center justify-center">
					<div className="w-full">
						<Navbar />
						<main className="mt-6 flex w-full flex-col items-center">
							<div className="w-full max-w-8xl px-4 lg:px-8">
								<NavigationTabs tab={tab}>{children}</NavigationTabs>
							</div>
						</main>
					</div>
				</div>
			</div>
		</div>
	);
};
