import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import copy from "copy-to-clipboard";
import {
	AlertTriangle,
	ArrowUpRight,
	Check,
	Copy,
	Globe,
	HelpCircle,
	Loader2,
	ServerOff,
} from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useEffect, useState } from "react";
import { toast } from "sonner";
import superjson from "superjson";
import { ShowImport } from "@/components/dashboard/application/advanced/import/show-import";
import { ShowVolumes } from "@/components/dashboard/application/advanced/volumes/show-volumes";
import { ShowDeployments } from "@/components/dashboard/application/deployments/show-deployments";
import { ShowDomains } from "@/components/dashboard/application/domains/show-domains";
import { ShowEnvironment } from "@/components/dashboard/application/environment/show-environment";
import { ShowIconSettings } from "@/components/dashboard/application/icon/show-icon-settings";
import { ShowPatches } from "@/components/dashboard/application/patches/show-patches";
import { ShowSchedules } from "@/components/dashboard/application/schedules/show-schedules";
import { ShowVolumeBackups } from "@/components/dashboard/application/volume-backups/show-volume-backups";
import { AddCommandCompose } from "@/components/dashboard/compose/advanced/add-command";
import { IsolatedDeploymentTab } from "@/components/dashboard/compose/advanced/add-isolation";
import { ShowComposeContainers } from "@/components/dashboard/compose/containers/show-compose-containers";
import { DeleteService } from "@/components/dashboard/compose/delete-service";
import { ShowGeneralCompose } from "@/components/dashboard/compose/general/show";
import { ShowDockerLogsCompose } from "@/components/dashboard/compose/logs/show";
import { ShowDockerLogsStack } from "@/components/dashboard/compose/logs/show-stack";
import { UpdateCompose } from "@/components/dashboard/compose/update-compose";
import { ShowBackups } from "@/components/dashboard/database/backups/show-backups";
import { ComposeFreeMonitoring } from "@/components/dashboard/monitoring/free/container/show-free-compose-monitoring";
import { ComposePaidMonitoring } from "@/components/dashboard/monitoring/paid/container/show-paid-compose-monitoring";
import { AssignComposeNetworks } from "@/components/dashboard/networks/assign-compose-networks";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { AdvanceBreadcrumb } from "@/components/shared/advance-breadcrumb";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { UseKeyboardNav } from "@/hooks/use-keyboard-nav";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { useWhitelabeling } from "@/utils/hooks/use-whitelabeling";

type TabState =
	| "projects"
	| "settings"
	| "advanced"
	| "deployments"
	| "domains"
	| "containers"
	| "monitoring"
	| "volumeBackups";

const Service = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const [_toggleMonitoring, _setToggleMonitoring] = useState(false);
	const { composeId, activeTab } = props;
	const router = useRouter();
	const { projectId, environmentId } = router.query;
	const [tab, setTab] = useState<TabState>(activeTab);

	useEffect(() => {
		if (router.query.tab) {
			setTab(router.query.tab as TabState);
		}
	}, [router.query.tab]);

	const { data } = api.compose.one.useQuery({ composeId });

	const { data: permissions } = api.user.getPermissions.useQuery();
	const canReadDeployments = !!permissions?.deployment.read;
	const canReadDomains = !!permissions?.domain.read;

	const { data: deployments } = api.deployment.allByCompose.useQuery(
		{
			composeId,
		},
		{
			enabled: canReadDeployments,
			refetchInterval: canReadDeployments ? 5000 : false,
		},
	);
	const { data: serviceDomains } = api.domain.byComposeId.useQuery(
		{ composeId },
		{
			enabled: canReadDomains,
			refetchInterval: canReadDomains ? 10000 : false,
		},
	);
	const latestLiveDeployment = deployments
		?.filter((d) => d.status === "done")
		.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
	const latestDeployment = deployments?.sort((a, b) =>
		(b.createdAt || "").localeCompare(a.createdAt || ""),
	)[0];
	const isDeploying = ["running", "queued"].includes(
		latestDeployment?.status || "",
	);
	const [appNameCopied, setAppNameCopied] = useState(false);

	const { data: auth } = api.user.get.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: serverIp } = api.settings.getIp.useQuery();
	const { data: environments } = api.environment.byProjectId.useQuery({
		projectId: data?.environment?.projectId || "",
	});
	const { config: whitelabeling } = useWhitelabeling();
	const appName = whitelabeling?.appName || "Dokploy";
	const environmentDropdownItems =
		environments?.map((env) => ({
			name: env.name,
			href: `/dashboard/project/${projectId}/environment/${env.environmentId}`,
		})) || [];

	return (
		<div className="pb-10">
			<UseKeyboardNav forPage="compose" />
			<AdvanceBreadcrumb />
			<Head>
				<title>
					Compose: {data?.name} - {data?.environment?.project?.name} | {appName}
				</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl w-full">
					<div className="rounded-xl bg-background shadow-md ">
						<div className="flex flex-col gap-4">
							<CardHeader className="flex flex-row justify-between items-start gap-6">
								<div className="flex flex-row gap-4 items-center min-w-0">
									<div className="relative shrink-0">
										<ShowIconSettings
											serviceId={composeId}
											serviceType="compose"
											icon={data?.icon}
										/>
										<div className="absolute -right-1 -top-2 z-10">
											<StatusTooltip status={data?.composeStatus} />
										</div>
									</div>
									<div className="flex flex-col gap-1 min-w-0">
										<CardTitle className="text-xl leading-tight truncate">
											{data?.name}
										</CardTitle>
										<button
											type="button"
											className="flex w-fit flex-row items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
											title="Copy compose project name"
											onClick={() => {
												copy(data?.appName || "");
												setAppNameCopied(true);
												setTimeout(() => setAppNameCopied(false), 1500);
											}}
										>
											{data?.appName}
											{appNameCopied ? (
												<Check className="size-3 text-green-600" />
											) : (
												<Copy className="size-3 opacity-50" />
											)}
										</button>
										{data?.description && (
											<CardDescription className="truncate">
												{data?.description}
											</CardDescription>
										)}
									</div>
								</div>
								<div className="flex flex-col h-fit w-fit gap-2">
									<div className="flex flex-row gap-2 justify-end flex-wrap">
										{latestLiveDeployment && (
											<Badge
												variant="secondary"
												className="gap-1.5 border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
												title={`Last successful deploy: ${latestLiveDeployment?.createdAt}`}
											>
												<span className="relative flex size-2">
													<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
													<span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
												</span>
												Live
											</Badge>
										)}
										{isDeploying && (
											<Badge
												variant="secondary"
												className="gap-1.5 border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
											>
												<Loader2 className="size-3 animate-spin" />
												Deploying
											</Badge>
										)}
										{latestDeployment?.status === "error" &&
											latestLiveDeployment && (
												<Badge
													variant="secondary"
													className="gap-1.5 border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
													title="The last deployment failed. The previous successful deployment is still serving traffic."
												>
													<AlertTriangle className="size-3" />
													Deploy failed
												</Badge>
											)}
										{!latestLiveDeployment && (
											<Badge
												variant="secondary"
												className="text-muted-foreground"
											>
												No deployments yet
											</Badge>
										)}
									</div>
									<div className="flex flex-row h-fit w-fit gap-2 items-center">
										<Badge
											className="cursor-pointer"
											onClick={() => {
												const ip = data?.server?.ipAddress || serverIp;
												if (ip) {
													copy(ip);
													toast.success("IP Address Copied!");
												}
											}}
											variant={
												!data?.serverId
													? "default"
													: data?.server?.serverStatus === "active"
														? "default"
														: "destructive"
											}
										>
											{data?.server?.name || "Dokploy Server"}
										</Badge>
										{data?.server?.serverStatus === "inactive" && (
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<Label className="break-all w-fit flex flex-row gap-1 items-center">
															<HelpCircle className="size-4 text-muted-foreground" />
														</Label>
													</TooltipTrigger>
													<TooltipContent
														className="z-999 w-[300px]"
														align="start"
														side="top"
													>
														<span>
															You cannot, deploy this application because the
															server is inactive, please upgrade your plan to
															add more servers.
														</span>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										)}
										{permissions?.service.create && (
											<UpdateCompose composeId={composeId} />
										)}
										{permissions?.service.delete && (
											<DeleteService id={composeId} type="compose" />
										)}
									</div>
								</div>
							</CardHeader>
							{(serviceDomains?.length ?? 0) > 0 && (
								<div className="flex flex-wrap items-center gap-2 px-6 pb-5">
									<Globe className="size-3.5 text-muted-foreground" />
									{serviceDomains?.map((domain) => (
										<a
											key={domain.domainId}
											href={`http${domain.https ? "s" : ""}://${domain.host}`}
											target="_blank"
											rel="noreferrer"
											className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
												domain.enabled
													? "border-border bg-accent hover:border-primary/40 hover:bg-primary/10"
													: "border-border bg-muted/40 text-muted-foreground line-through opacity-70"
											}`}
										>
											<ArrowUpRight className="size-3" />
											{domain.host}
										</a>
									))}
								</div>
							)}
						</div>
						<CardContent className="space-y-2 py-8 border-t">
							{data?.server?.serverStatus === "inactive" ? (
								<div className="flex h-[55vh] border-2 rounded-xl border-dashed p-4">
									<div className="max-w-3xl mx-auto flex flex-col items-center justify-center self-center gap-3">
										<ServerOff className="size-10 text-muted-foreground self-center" />
										<span className="text-center text-base text-muted-foreground">
											This service is hosted on the server {data.server.name},
											but this server has been disabled because your current
											plan doesn't include enough servers. Please purchase more
											servers to regain access to this application.
										</span>
										<span className="text-center text-base text-muted-foreground">
											Go to{" "}
											<Link
												href="/dashboard/settings/billing"
												className="text-primary"
											>
												Billing
											</Link>
										</span>
									</div>
								</div>
							) : (
								<Tabs
									value={tab}
									defaultValue="general"
									className="w-full"
									onValueChange={(e) => {
										setTab(e as TabState);
										const newPath = `/dashboard/project/${projectId}/environment/${environmentId}/services/compose/${composeId}?tab=${e}`;
										router.push(newPath);
									}}
								>
									<div className="flex flex-row items-center w-full overflow-auto">
										<TabsList className="flex gap-8 max-md:gap-4 justify-start">
											<TabsTrigger value="general">General</TabsTrigger>
											{permissions?.envVars.read && (
												<TabsTrigger value="environment">
													Environment
												</TabsTrigger>
											)}
											{permissions?.domain.read && (
												<TabsTrigger value="domains">Domains</TabsTrigger>
											)}
											{permissions?.deployment.read && (
												<TabsTrigger value="deployments">
													Deployments
												</TabsTrigger>
											)}
											{permissions?.service.read && (
												<TabsTrigger value="containers">Containers</TabsTrigger>
											)}
											{permissions?.service.create && (
												<TabsTrigger value="backups">Backups</TabsTrigger>
											)}
											{permissions?.schedule.read && (
												<TabsTrigger value="schedules">Schedules</TabsTrigger>
											)}
											{permissions?.volumeBackup.read && (
												<TabsTrigger value="volumeBackups">
													Volume Backups
												</TabsTrigger>
											)}
											{permissions?.logs.read && (
												<TabsTrigger value="logs">Logs</TabsTrigger>
											)}
											{data?.sourceType !== "raw" && (
												<TabsTrigger value="patches">Patches</TabsTrigger>
											)}
											{permissions?.monitoring.read &&
												((data?.serverId && isCloud) || !data?.server) && (
													<TabsTrigger value="monitoring">
														Monitoring
													</TabsTrigger>
												)}
											{permissions?.service.create && (
												<TabsTrigger value="advanced">Advanced</TabsTrigger>
											)}
										</TabsList>
									</div>

									<TabsContent value="general">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowGeneralCompose composeId={composeId} />
										</div>
									</TabsContent>
									{permissions?.envVars.read && (
										<TabsContent value="environment">
											<div className="flex flex-col gap-4 pt-2.5">
												<ShowEnvironment id={composeId} type="compose" />
											</div>
										</TabsContent>
									)}
									{permissions?.service.create && (
										<TabsContent value="backups">
											<div className="flex flex-col gap-4 pt-2.5">
												<ShowBackups id={composeId} backupType="compose" />
											</div>
										</TabsContent>
									)}

									{permissions?.schedule.read && (
										<TabsContent value="schedules">
											<div className="flex flex-col gap-4 pt-2.5">
												<ShowSchedules id={composeId} scheduleType="compose" />
											</div>
										</TabsContent>
									)}
									{permissions?.volumeBackup.read && (
										<TabsContent value="volumeBackups">
											<div className="flex flex-col gap-4 pt-2.5">
												<ShowVolumeBackups
													id={composeId}
													type="compose"
													serverId={data?.serverId || ""}
												/>
											</div>
										</TabsContent>
									)}
									{permissions?.service.read && (
										<TabsContent value="containers">
											<div className="flex flex-col gap-4 pt-2.5">
												<ShowComposeContainers
													serverId={data?.serverId || undefined}
													appName={data?.appName || ""}
													appType={data?.composeType || "docker-compose"}
													serviceId={data?.composeId}
												/>
											</div>
										</TabsContent>
									)}

									{permissions?.monitoring.read && (
										<TabsContent value="monitoring">
											<div className="pt-2.5">
												<div className="flex flex-col border rounded-lg ">
													{data?.serverId && isCloud ? (
														<ComposePaidMonitoring
															serverId={data?.serverId || ""}
															baseUrl={`${data?.serverId ? `http://${data?.server?.ipAddress}:${data?.server?.metricsConfig?.server?.port}` : "http://localhost:4500"}`}
															appName={data?.appName || ""}
															token={
																data?.server?.metricsConfig?.server?.token || ""
															}
															appType={data?.composeType || "docker-compose"}
														/>
													) : (
														<>
															{/* {monitoring?.enabledFeatures &&
															isCloud &&
															data?.serverId && (
																<div className="flex flex-row border w-fit p-4 rounded-lg items-center gap-2 m-4">
																	<Label className="text-muted-foreground">
																		Change Monitoring
																	</Label>
																	<Switch
																		checked={toggleMonitoring}
																		onCheckedChange={setToggleMonitoring}
																	/>
																</div>
															)}

														{toggleMonitoring ? (
															<ComposePaidMonitoring
																appName={data?.appName || ""}
																baseUrl={`http://${monitoring?.serverIp}:${monitoring?.metricsConfig?.server?.port}`}
																token={
																	monitoring?.metricsConfig?.server?.token || ""
																}
																appType={data?.composeType || "docker-compose"}
															/>
														) : ( */}
															{/* <div> */}
															<ComposeFreeMonitoring
																serverId={data?.serverId || ""}
																appName={data?.appName || ""}
																appType={data?.composeType || "docker-compose"}
															/>
															{/* </div> */}
															{/* )} */}
														</>
													)}
												</div>
											</div>
										</TabsContent>
									)}

									{permissions?.logs.read && (
										<TabsContent value="logs">
											<div className="flex flex-col gap-4 pt-2.5">
												{data?.composeType === "docker-compose" ? (
													<ShowDockerLogsCompose
														serverId={data?.serverId || ""}
														appName={data?.appName || ""}
														appType={data?.composeType || "docker-compose"}
														serviceId={data?.composeId}
													/>
												) : (
													<ShowDockerLogsStack
														serverId={data?.serverId || ""}
														appName={data?.appName || ""}
														serviceId={data?.composeId}
													/>
												)}
											</div>
										</TabsContent>
									)}

									{permissions?.deployment.read && (
										<TabsContent value="deployments" className="w-full pt-2.5">
											<div className="flex flex-col gap-4 border rounded-lg">
												<ShowDeployments
													id={composeId}
													type="compose"
													serverId={data?.serverId || ""}
													refreshToken={data?.refreshToken || ""}
												/>
											</div>
										</TabsContent>
									)}

									{permissions?.domain.read && (
										<TabsContent value="domains">
											<div className="flex flex-col gap-4 pt-2.5">
												<ShowDomains id={composeId} type="compose" />
											</div>
										</TabsContent>
									)}

									<TabsContent value="patches" className="w-full">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowPatches id={composeId} type="compose" />
										</div>
									</TabsContent>

									{permissions?.service.create && (
										<TabsContent value="advanced">
											<div className="flex flex-col gap-4 pt-2.5">
												<AddCommandCompose composeId={composeId} />
												<ShowVolumes id={composeId} type="compose" />
												<ShowImport composeId={composeId} />
												<AssignComposeNetworks composeId={composeId} />
												<IsolatedDeploymentTab composeId={composeId} />
											</div>
										</TabsContent>
									)}
								</Tabs>
							)}
						</CardContent>
					</div>
				</Card>
			</div>
		</div>
	);
};

export default Service;
Service.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{
		composeId: string;
		activeTab: TabState;
		environmentId: string;
	}>,
) {
	const { query, params, req, res } = ctx;

	const activeTab = query.tab;
	const { user, session } = await validateRequest(req);
	if (!user) {
		return {
			redirect: {
				permanent: false,
				destination: "/",
			},
		};
	}
	// Fetch data from external API
	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});

	// Valid project, if not return to initial homepage....
	if (typeof params?.composeId === "string") {
		try {
			await helpers.compose.one.fetch({
				composeId: params?.composeId,
			});
			await helpers.settings.isCloud.prefetch();
			return {
				props: {
					trpcState: helpers.dehydrate(),
					composeId: params?.composeId,
					activeTab: (activeTab || "general") as TabState,
					environmentId: params?.environmentId,
				},
			};
		} catch {
			return {
				redirect: {
					permanent: false,
					destination: "/dashboard/home",
				},
			};
		}
	}

	return {
		redirect: {
			permanent: false,
			destination: "/",
		},
	};
}
