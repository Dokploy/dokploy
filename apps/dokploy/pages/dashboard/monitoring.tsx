import { ContainerFreeMonitoring } from "@/components/dashboard/monitoring/free/container/show-free-container-monitoring";
import { ShowPaidMonitoring } from "@/components/dashboard/monitoring/paid/servers/show-paid-monitoring";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { Card } from "@/components/ui/card";
import { api } from "@/utils/api";
import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/index";
import type { GetServerSidePropsContext } from "next";
import type React from "react";
import type { ReactElement } from "react";

const BASE_URL =
	process.env.NEXT_PUBLIC_METRICS_URL || "http://localhost:3001/metrics";

const Dashboard = () => {
	const { data: admin } = api.admin.one.useQuery();
	return (
		<div className="space-y-4 pb-10">
			<AlertBlock>
				You are watching the <strong>Free</strong> plan.{" "}
				<a
					href="https://dokploy.com#pricing"
					target="_blank"
					className="underline"
					rel="noreferrer"
				>
					Upgrade
				</a>{" "}
				to get more features.
			</AlertBlock>
			{admin?.enablePaidFeatures ? (
				<Card className="h-full bg-sidebar  p-2.5 rounded-xl  mx-auto">
					<div className="rounded-xl bg-background shadow-md px-4">
						<ShowPaidMonitoring
							BASE_URL={
								process.env.NODE_ENV === "production"
									? `http://${admin?.serverIp}:${admin?.defaultPortMetrics}/metrics`
									: BASE_URL
							}
							token={"testing" || admin?.metricsToken}
						/>
					</div>
				</Card>
			) : (
				<Card className="h-full bg-sidebar  p-2.5 rounded-xl">
					<div className="rounded-xl bg-background shadow-md p-6">
						<ContainerFreeMonitoring appName="dokploy" />
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
	const { user } = await validateRequest(ctx.req, ctx.res);
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
