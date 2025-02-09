import { ShowClusterSettings } from "@/components/dashboard/application/advanced/cluster/show-cluster-settings";
import { AddCommand } from "@/components/dashboard/application/advanced/general/add-command";
import { ShowPorts } from "@/components/dashboard/application/advanced/ports/show-port";
import { ShowRedirects } from "@/components/dashboard/application/advanced/redirects/show-redirects";
import { ShowSecurity } from "@/components/dashboard/application/advanced/security/show-security";
import { ShowResources } from "@/components/dashboard/application/advanced/show-resources";
import { ShowTraefikConfig } from "@/components/dashboard/application/advanced/traefik/show-traefik-config";
import { ShowVolumes } from "@/components/dashboard/application/advanced/volumes/show-volumes";
import { ShowDeployments } from "@/components/dashboard/application/deployments/show-deployments";
import { ShowDomains } from "@/components/dashboard/application/domains/show-domains";
import { ShowEnvironment } from "@/components/dashboard/application/environment/show";
import { ShowGeneralApplication } from "@/components/dashboard/application/general/show";
import { ShowDockerLogs } from "@/components/dashboard/application/logs/show";
import { ShowPreviewDeployments } from "@/components/dashboard/application/preview-deployments/show-preview-deployments";
import { UpdateApplication } from "@/components/dashboard/application/update-application";
import { DeleteService } from "@/components/dashboard/compose/delete-service";
import { ContainerFreeMonitoring } from "@/components/dashboard/monitoring/free/container/show-free-container-monitoring";
import { ContainerPaidMonitoring } from "@/components/dashboard/monitoring/paid/container/show-paid-container-monitoring";
import { ProjectLayout } from "@/components/layouts/project-layout";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { validateRequest } from "@dokploy/server";
import { createServerSideHelpers } from "@trpc/react-query/server";
import copy from "copy-to-clipboard";
import { GlobeIcon, HelpCircle, ServerOff, Trash2 } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, type ReactElement } from "react";
import { toast } from "sonner";
import superjson from "superjson";

type TabState =
	| "projects"
	| "settings"
	| "advanced"
	| "deployments"
	| "domains"
	| "monitoring"
	| "preview-deployments";

const Service = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const [toggleMonitoring, setToggleMonitoring] = useState(false);
	const { applicationId, activeTab } = props;
	const router = useRouter();
	const { projectId } = router.query;
	const [tab, setTab] = useState<TabState>(activeTab);

	useEffect(() => {
		if (router.query.tab) {
			setTab(router.query.tab as TabState);
		}
	}, [router.query.tab]);

	const { data } = api.application.one.useQuery(
		{ applicationId },
		{
			refetchInterval: 5000,
		},
	);

	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: auth } = api.auth.get.useQuery();
	const { data: monitoring } = api.admin.getMetricsToken.useQuery();
	const { data: user } = api.user.byAuthId.useQuery(
		{
			authId: auth?.id || "",
		},
		{
			enabled: !!auth?.id && auth?.rol === "user",
		},
	);

	return (
		<div className="pb-10">
			<BreadcrumbSidebar
				list={[
					{ name: "Projects", href: "/dashboard/projects" },
					{
						name: data?.project?.name || "",
						href: `/dashboard/project/${projectId}`,
					},
					{
						name: data?.name || "",
						href: `/dashboard/project/${projectId}/services/application/${applicationId}`,
					},
				]}
			/>
			<Head>
				<title>
					Application: {data?.name} - {data?.project.name} | Dokploy
				</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar  p-2.5 rounded-xl w-full">
					<div className="rounded-xl bg-background shadow-md ">
						<CardHeader className="flex flex-row justify-between items-center">
							<div className="flex flex-col">
								<CardTitle className="text-xl flex flex-row gap-2">
									<div className="relative flex flex-row gap-4">
										<div className="absolute -right-1  -top-2">
											<StatusTooltip status={data?.applicationStatus} />
										</div>

										<GlobeIcon className="h-6 w-6 text-muted-foreground" />
									</div>
									{data?.name}
								</CardTitle>
								{data?.description && (
									<CardDescription>{data?.description}</CardDescription>
								)}

								<span className="text-sm text-muted-foreground">
									{data?.appName}
								</span>
							</div>
							<div className="flex flex-col h-fit w-fit gap-2">
								<div className="flex flex-row h-fit w-fit gap-2">
									<Badge
										className="cursor-pointer"
										onClick={() => {
											if (data?.server?.ipAddress) {
												copy(data.server.ipAddress);
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
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger asChild>
													<Label className="break-all w-fit flex flex-row gap-1 items-center">
														<HelpCircle className="size-4 text-muted-foreground" />
													</Label>
												</TooltipTrigger>
												<TooltipContent
													className="z-[999] w-[300px]"
													align="start"
													side="top"
												>
													<span>
														You cannot, deploy this application because the
														server is inactive, please upgrade your plan to add
														more servers.
													</span>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									)}
								</div>

								<div className="flex flex-row gap-2 justify-end">
									<UpdateApplication applicationId={applicationId} />
									{(auth?.rol === "admin" || user?.canDeleteServices) && (
										<DeleteService id={applicationId} type="application" />
									)}
								</div>
							</div>
						</CardHeader>
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
										const newPath = `/dashboard/project/${projectId}/services/application/${applicationId}?tab=${e}`;
										router.push(newPath);
									}}
								>
									<div className="flex flex-row items-center justify-between  w-full gap-4">
										<TabsList
											className={cn(
												"flex gap-8 justify-start max-xl:overflow-x-scroll overflow-y-hidden",
												isCloud && data?.serverId
													? "md:grid-cols-7"
													: data?.serverId
														? "md:grid-cols-6"
														: "md:grid-cols-7",
											)}
										>
											<TabsTrigger value="general">General</TabsTrigger>
											<TabsTrigger value="environment">Environment</TabsTrigger>
											{((data?.serverId && isCloud) || !data?.server) && (
												<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
											)}
											<TabsTrigger value="logs">Logs</TabsTrigger>
											<TabsTrigger value="deployments">Deployments</TabsTrigger>
											<TabsTrigger value="preview-deployments">
												Preview Deployments
											</TabsTrigger>
											<TabsTrigger value="domains">Domains</TabsTrigger>
											<TabsTrigger value="advanced">Advanced</TabsTrigger>
										</TabsList>
									</div>

									<TabsContent value="general">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowGeneralApplication applicationId={applicationId} />
										</div>
									</TabsContent>
									<TabsContent value="environment">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowEnvironment applicationId={applicationId} />
										</div>
									</TabsContent>

									<TabsContent value="monitoring">
										<div className="pt-2.5">
											<div className="flex flex-col gap-4 border rounded-lg p-6">
												{data?.serverId && isCloud ? (
													<ContainerPaidMonitoring
														appName={data?.appName || ""}
														baseUrl={`${data?.serverId ? `http://${data?.server?.ipAddress}:${data?.server?.metricsConfig?.server?.port}` : "http://localhost:4500"}`}
														token={
															data?.server?.metricsConfig?.server?.token || ""
														}
													/>
												) : (
													<>
														{/* {monitoring?.enabledFeatures &&
															isCloud &&
															data?.serverId && (
																<div className="flex flex-row border w-fit p-4 rounded-lg items-center gap-2">
																	<Label className="text-muted-foreground">
																		Change Monitoring
																	</Label>
																	<Switch
																		checked={toggleMonitoring}
																		onCheckedChange={setToggleMonitoring}
																	/>
																</div>
															)} */}

														{/* {toggleMonitoring ? (
															<ContainerPaidMonitoring
																appName={data?.appName || ""}
																baseUrl={`http://${monitoring?.serverIp}:${monitoring?.metricsConfig?.server?.port}`}
																token={
																	monitoring?.metricsConfig?.server?.token || ""
																}
															/>
														) : ( */}
														<div>
															<ContainerFreeMonitoring
																appName={data?.appName || ""}
															/>
														</div>
														{/* )} */}
													</>
												)}
											</div>
										</div>
									</TabsContent>

									<TabsContent value="logs">
										<div className="flex flex-col gap-4  pt-2.5">
											<ShowDockerLogs
												appName={data?.appName || ""}
												serverId={data?.serverId || ""}
											/>
										</div>
									</TabsContent>
									<TabsContent value="deployments" className="w-full">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowDeployments applicationId={applicationId} />
										</div>
									</TabsContent>
									<TabsContent value="preview-deployments" className="w-full">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowPreviewDeployments applicationId={applicationId} />
										</div>
									</TabsContent>
									<TabsContent value="domains" className="w-full">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowDomains applicationId={applicationId} />
										</div>
									</TabsContent>
									<TabsContent value="advanced">
										<div className="flex flex-col gap-4 pt-2.5">
											<AddCommand applicationId={applicationId} />
											<ShowClusterSettings applicationId={applicationId} />

											<ShowResources id={applicationId} type="application" />
											<ShowVolumes id={applicationId} type="application" />
											<ShowRedirects applicationId={applicationId} />
											<ShowSecurity applicationId={applicationId} />
											<ShowPorts applicationId={applicationId} />
											<ShowTraefikConfig applicationId={applicationId} />
										</div>
									</TabsContent>
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
	return <ProjectLayout>{page}</ProjectLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{
		applicationId: string;
		activeTab: TabState;
	}>,
) {
	const { query, params, req, res } = ctx;

	const activeTab = query.tab;
	const { user, session } = await validateRequest(req, res);
	if (!user) {
		return {
			redirect: {
				permanent: true,
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
			session: session,
			user: user,
		},
		transformer: superjson,
	});

	// Valid project, if not return to initial homepage....
	if (typeof params?.applicationId === "string") {
		try {
			await helpers.application.one.fetch({
				applicationId: params?.applicationId,
			});

			await helpers.settings.isCloud.prefetch();

			return {
				props: {
					trpcState: helpers.dehydrate(),
					applicationId: params?.applicationId,
					activeTab: (activeTab || "general") as TabState,
				},
			};
		} catch (error) {
			return {
				redirect: {
					permanent: false,
					destination: "/dashboard/projects",
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
