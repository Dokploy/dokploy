import { IS_CLOUD } from "@dokploy/server/constants";
import { validateRequest } from "@dokploy/server/lib/auth";
import { Loader2 } from "lucide-react";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { ContainerFreeMonitoring } from "@/components/dashboard/monitoring/free/container/show-free-container-monitoring";
import { ShowPaidMonitoring } from "@/components/dashboard/monitoring/paid/servers/show-paid-monitoring";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { api } from "@/utils/api";

const BASE_URL = "http://localhost:3001/metrics";

const DEFAULT_TOKEN = "metrics";

interface MonitoringResource {
	key: string;
	projectId: string;
	projectName: string;
	appName: string;
	label: string;
	type: string;
	appType: "application" | "stack" | "docker-compose";
}

const Dashboard = () => {
	const [toggleMonitoring, _setToggleMonitoring] = useLocalStorage(
		"monitoring-enabled",
		false,
	);
	const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
	const [selectedResourceKey, setSelectedResourceKey] = useState<string>("");

	const { data: monitoring, isLoading } = api.user.getMetricsToken.useQuery();
	const { data: projects } = api.project.all.useQuery(undefined, {
		refetchOnWindowFocus: false,
	});

	const resources = useMemo<MonitoringResource[]>(() => {
		if (!projects) {
			return [];
		}

		return projects.flatMap((project) => {
			const projectId = project.projectId;
			const projectName = project.name;

			return project.environments.flatMap((environment) => [
				...environment.applications
					.filter((app) => Boolean(app.appName))
					.map((app) => ({
						key: `application-${app.applicationId}`,
						projectId,
						projectName,
						appName: app.appName,
						label: app.name,
						type: "Application",
						appType: "application" as const,
					})),
				...environment.compose
					.filter((service) => Boolean(service.appName))
					.map((service) => ({
						key: `compose-${service.composeId}`,
						projectId,
						projectName,
						appName: service.appName,
						label: service.name,
						type: "Compose",
						appType: service.composeType || "docker-compose",
					})),
				...environment.postgres
					.filter((service) => Boolean(service.appName))
					.map((service) => ({
						key: `postgres-${service.postgresId}`,
						projectId,
						projectName,
						appName: service.appName,
						label: service.name,
						type: "Postgres",
						appType: "application" as const,
					})),
				...environment.redis
					.filter((service) => Boolean(service.appName))
					.map((service) => ({
						key: `redis-${service.redisId}`,
						projectId,
						projectName,
						appName: service.appName,
						label: service.name,
						type: "Redis",
						appType: "application" as const,
					})),
				...environment.mysql
					.filter((service) => Boolean(service.appName))
					.map((service) => ({
						key: `mysql-${service.mysqlId}`,
						projectId,
						projectName,
						appName: service.appName,
						label: service.name,
						type: "MySQL",
						appType: "application" as const,
					})),
				...environment.mongo
					.filter((service) => Boolean(service.appName))
					.map((service) => ({
						key: `mongo-${service.mongoId}`,
						projectId,
						projectName,
						appName: service.appName,
						label: service.name,
						type: "MongoDB",
						appType: "application" as const,
					})),
				...environment.mariadb
					.filter((service) => Boolean(service.appName))
					.map((service) => ({
						key: `mariadb-${service.mariadbId}`,
						projectId,
						projectName,
						appName: service.appName,
						label: service.name,
						type: "MariaDB",
						appType: "application" as const,
					})),
			]);
		});
	}, [projects]);

	const projectOptions = useMemo(
		() =>
			Array.from(
				new Map(
					resources.map((resource) => [
						resource.projectId,
						{
							projectId: resource.projectId,
							projectName: resource.projectName,
						},
					]),
				).values(),
			),
		[resources],
	);

	const resourceOptions = useMemo(
		() =>
			selectedProjectId === "all"
				? []
				: resources.filter(
						(resource) => resource.projectId === selectedProjectId,
					),
		[resources, selectedProjectId],
	);

	const selectedResource = useMemo(
		() =>
			resourceOptions.find((resource) => resource.key === selectedResourceKey),
		[resourceOptions, selectedResourceKey],
	);

	useEffect(() => {
		if (selectedProjectId === "all") {
			setSelectedResourceKey("");
			return;
		}

		if (resourceOptions.length === 0) {
			setSelectedResourceKey("");
			return;
		}

		const hasSelectedResource = resourceOptions.some(
			(resource) => resource.key === selectedResourceKey,
		);

		if (!hasSelectedResource) {
			setSelectedResourceKey("");
		}
	}, [resourceOptions, selectedProjectId, selectedResourceKey]);

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
			{isLoading ? (
				<Card className="bg-sidebar  p-2.5 rounded-xl  mx-auto  items-center">
					<div className="rounded-xl bg-background flex shadow-md px-4 min-h-[50vh] justify-center items-center text-muted-foreground">
						Loading...
						<Loader2 className="h-4 w-4 animate-spin" />
					</div>
				</Card>
			) : (
				<>
					{/* {monitoring?.enabledFeatures && (
						<div className="flex flex-row border w-fit p-4 rounded-lg items-center gap-2">
							<Label className="text-muted-foreground">Change Monitoring</Label>
							<Switch
								checked={toggleMonitoring}
								onCheckedChange={setToggleMonitoring}
							/>
						</div>
					)} */}
					{toggleMonitoring ? (
						<Card className="bg-sidebar  p-2.5 rounded-xl  mx-auto">
							<div className="rounded-xl bg-background shadow-md">
								<ShowPaidMonitoring
									BASE_URL={
										process.env.NODE_ENV === "production"
											? `http://${monitoring?.serverIp}:${monitoring?.metricsConfig?.server?.port}/metrics`
											: BASE_URL
									}
									token={
										process.env.NODE_ENV === "production"
											? monitoring?.metricsConfig?.server?.token
											: DEFAULT_TOKEN
									}
								/>
							</div>
						</Card>
					) : (
						<Card className="h-full bg-sidebar  p-2.5 rounded-xl">
							<div className="rounded-xl bg-background shadow-md p-6">
								<div className="space-y-4">
									<div className="flex items-center gap-4 flex-wrap">
										<div>
											<span className="text-sm text-muted-foreground">
												Project:
											</span>
											<Select
												value={selectedProjectId}
												onValueChange={(value) => {
													setSelectedProjectId(value);
													setSelectedResourceKey("");
												}}
											>
												<SelectTrigger className="w-[240px]">
													<SelectValue placeholder="Whole server (default)" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">
														Whole server (default)
													</SelectItem>
													{projectOptions.map((project) => (
														<SelectItem
															key={project.projectId}
															value={project.projectId}
														>
															{project.projectName}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										<div>
											<span className="text-sm text-muted-foreground">
												Application or resource:
											</span>
											<Select
												value={selectedResourceKey}
												onValueChange={setSelectedResourceKey}
												disabled={
													selectedProjectId === "all" ||
													resourceOptions.length === 0
												}
											>
												<SelectTrigger className="w-[320px]">
													<SelectValue placeholder="Select an application or resource" />
												</SelectTrigger>
												<SelectContent>
													{resourceOptions.map((resource) => (
														<SelectItem key={resource.key} value={resource.key}>
															{resource.label} ({resource.type})
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>

									{selectedResource ? (
										<ContainerFreeMonitoring
											appName={selectedResource.appName}
											appType={selectedResource.appType}
										/>
									) : (
										<ContainerFreeMonitoring appName="dokploy" />
									)}
								</div>
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
