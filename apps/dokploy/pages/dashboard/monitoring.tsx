import { ContainerFreeMonitoring } from "@/components/dashboard/monitoring/free/container/show-free-container-monitoring";
import { ShowPaidMonitoring } from "@/components/dashboard/monitoring/paid/servers/show-paid-monitoring";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AlertBlock } from "@/components/shared/alert-block";
import { api } from "@/utils/api";
import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/index";
import type { GetServerSidePropsContext } from "next";
import type React from "react";
import type { ReactElement } from "react";

const BASE_URL =
	process.env.NEXT_PUBLIC_METRICS_URL || "http://localhost:4500/metrics";

interface SystemMetrics {
	cpu: string;
	cpuModel: string;
	cpuCores: number;
	cpuPhysicalCores: number;
	cpuSpeed: number;
	os: string;
	distro: string;
	kernel: string;
	arch: string;
	memUsed: string;
	memUsedGB: string;
	memTotal: string;
	uptime: number;
	diskUsed: string;
	totalDisk: string;
	networkIn: string;
	networkOut: string;
	timestamp: string;
}

const Dashboard = () => {
	const { data: admin } = api.admin.one.useQuery();
	return (
		<div className="space-y-4 pt-5 pb-10">
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
				<ShowPaidMonitoring
					BASE_URL={
						process.env.NODE_ENV === "production"
							? `http://${admin?.serverIp}:${admin?.defaultPortMetrics}/metrics`
							: BASE_URL
					}
					token={admin?.metricsToken}
				/>
			) : (
				<ContainerFreeMonitoring appName="dokploy" />
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
