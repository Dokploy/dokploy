import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/lib/auth";
import { Loader2 } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { ShowPaidMonitoring } from "@/components/dashboard/monitoring/paid/servers/show-paid-monitoring";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { Card } from "@/components/ui/card";
import { api } from "@/utils/api";

const Dashboard = () => {
	const { data: monitoring, isLoading } = api.user.getMetricsToken.useQuery();
	return (
		<div className="space-y-4 pb-10">
			{isLoading ? (
				<Card className="bg-sidebar  p-2.5 rounded-xl  mx-auto  items-center">
					<div className="rounded-xl bg-background flex shadow-md px-4 min-h-[50vh] justify-center items-center text-muted-foreground">
						Loading...
						<Loader2 className="h-4 w-4 animate-spin" />
					</div>
				</Card>
			) : (
				<Card className="bg-sidebar  p-2.5 rounded-xl  mx-auto">
					<div className="rounded-xl bg-background shadow-md">
						<ShowPaidMonitoring
							BASE_URL={`http://${monitoring?.serverIp || "localhost"}:${monitoring?.metricsConfig?.server?.port || 4500}/metrics`}
							token={
								monitoring?.metricsConfig?.server?.token || ""
							}
						/>
					</div>
				</Card>
			)}
		</div>
	);
};

export default Dashboard;

Dashboard.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};
export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ serviceId: string }>,
) {
	if (IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/projects",
			},
		};
	}
	const { user } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}

	return {
		props: {},
	};
}
