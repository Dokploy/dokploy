import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/lib/auth";
import { hasPermission } from "@dokploy/server/services/permission";
import { Cpu, HardDrive, Loader2, MemoryStick, Server } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import { type ReactElement, useEffect, useState } from "react";
import { ContainerFreeMonitoring } from "@/components/dashboard/monitoring/free/container/show-free-container-monitoring";
import { ShowPaidMonitoring } from "@/components/dashboard/monitoring/paid/servers/show-paid-monitoring";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { api } from "@/utils/api";

const Dashboard = () => {
	const [toggleMonitoring, _setToggleMonitoring] = useLocalStorage(
		"monitoring-enabled",
		false,
	);

	const { data: monitoring, isPending } = api.user.getMetricsToken.useQuery();
	const { data: remoteServers } = api.server.monitoringServers.useQuery();
	const hasRemoteServers = (remoteServers?.length ?? 0) > 0;
	const { data: overview } = api.server.monitoringOverview.useQuery(undefined, {
		enabled: hasRemoteServers,
		refetchInterval: 30000,
	});
	const [selectedServerId, setSelectedServerId] = useState("local");

	useEffect(() => {
		if (
			selectedServerId !== "local" &&
			!remoteServers?.some((server) => server.serverId === selectedServerId)
		) {
			setSelectedServerId("local");
		}
	}, [remoteServers, selectedServerId]);

	const renderMetric = (
		metric: Record<string, unknown> | null | undefined,
		key: string,
		suffix = "",
	) => {
		const value = metric?.[key];
		return value === undefined || value === null ? "N/A" : `${value}${suffix}`;
	};

	return (
		<div className="space-y-4 pb-10">
			{/* <AlertBlock>
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
			</AlertBlock> */}
			{isPending ? (
				<Card className="bg-sidebar  p-2.5 rounded-xl  mx-auto  items-center">
					<div className="rounded-xl bg-background flex shadow-md px-4 w-full min-h-[50vh] justify-center items-center text-muted-foreground">
						Loading... <Loader2 className="h-4 w-4 animate-spin" />
					</div>
				</Card>
			) : (
				<>
					{hasRemoteServers && (
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<div>
									<h1 className="text-2xl font-semibold">Server Monitoring</h1>
									<p className="text-sm text-muted-foreground">
										Select a server to inspect its detailed metrics.
									</p>
								</div>
							</div>
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								{overview?.map((item) => {
									const value = item.serverId || "local";
									return (
										<Button
											key={value}
											type="button"
											variant="outline"
											className={`h-auto items-stretch justify-start p-0 text-left ${
												selectedServerId === value ? "border-primary" : ""
											}`}
											onClick={() => setSelectedServerId(value)}
										>
											<div className="w-full space-y-4 p-4">
												<div className="flex items-center justify-between gap-2">
													<div className="flex items-center gap-2">
														<Server className="size-4 text-muted-foreground" />
														<span className="font-semibold">{item.name}</span>
													</div>
													<Badge
														variant={item.available ? "default" : "destructive"}
													>
														{item.available ? "Available" : "Unavailable"}
													</Badge>
												</div>
												<div className="grid grid-cols-3 gap-3 text-xs">
													<div className="space-y-1">
														<Cpu className="size-4 text-muted-foreground" />
														<p>{renderMetric(item.metrics, "cpu", "%")}</p>
													</div>
													<div className="space-y-1">
														<MemoryStick className="size-4 text-muted-foreground" />
														<p>
															{renderMetric(item.metrics, "memUsedGB", " GB")}
														</p>
													</div>
													<div className="space-y-1">
														<HardDrive className="size-4 text-muted-foreground" />
														<p>{renderMetric(item.metrics, "diskUsed", "%")}</p>
													</div>
												</div>
												{!item.available && (
													<p className="line-clamp-2 text-xs text-muted-foreground">
														{item.error}
													</p>
												)}
											</div>
										</Button>
									);
								})}
							</div>
						</div>
					)}
					{/* {monitoring?.enabledFeatures && (
						<div className="flex flex-row border w-fit p-4 rounded-lg items-center gap-2">
							<Label className="text-muted-foreground">Change Monitoring</Label>
							<Switch
								checked={toggleMonitoring}
								onCheckedChange={setToggleMonitoring}
							/>
						</div>
					)} */}
					{hasRemoteServers && selectedServerId !== "local" ? (
						<Card className="bg-sidebar p-2.5 rounded-xl mx-auto">
							<div className="rounded-xl bg-background shadow-md">
								<ShowPaidMonitoring serverId={selectedServerId} />
							</div>
						</Card>
					) : toggleMonitoring ? (
						<Card className="bg-sidebar  p-2.5 rounded-xl  mx-auto">
							<div className="rounded-xl bg-background shadow-md">
								<ShowPaidMonitoring />
							</div>
						</Card>
					) : (
						<Card className="h-full bg-sidebar  p-2.5 rounded-xl">
							<div className="rounded-xl bg-background shadow-md p-6">
								<ContainerFreeMonitoring appName="dokploy" />
							</div>
						</Card>
					)}
				</>
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
				permanent: false,
				destination: "/dashboard/home",
			},
		};
	}
	const { user, session } = await validateRequest(ctx.req);
	if (!user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}

	const canView = await hasPermission(
		{
			user: { id: user.id },
			session: { activeOrganizationId: session?.activeOrganizationId || "" },
		},
		{ monitoring: ["read"] },
	);

	if (!canView) {
		return {
			redirect: {
				permanent: false,
				destination: "/dashboard/home",
			},
		};
	}

	return {
		props: {},
	};
}
