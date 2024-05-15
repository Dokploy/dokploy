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
        className="bg-radial relative flex flex-col bg-background min-h-screen w-full"
        id="app-container"
      >
        <Navbar />
        <main className="pt-6 flex w-full flex-col items-center">
          <div className="w-full max-w-8xl px-4 lg:px-8">
            <NavigationTabs tab={tab}>{children}</NavigationTabs>
          </div>
        </main>
      </div>
    </div>
  );
};
