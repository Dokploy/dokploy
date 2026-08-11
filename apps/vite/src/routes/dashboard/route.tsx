import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { getCachedSession } from "~/utils/session";

const DashboardRouteComponent = () => {
	return (
		<DashboardLayout>
			<Outlet />
		</DashboardLayout>
	);
};

export const Route = createFileRoute("/dashboard")({
	ssr: false,
	beforeLoad: async () => {
		const session = await getCachedSession();
		if (!session?.session) {
			throw redirect({ to: "/" });
		}
	},
	component: DashboardRouteComponent,
});
