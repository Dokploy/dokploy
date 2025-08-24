import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import { HelpCircle, ServerOff } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useState } from "react";
import superjson from "superjson";
import { ShowEnvironment } from "@/components/dashboard/application/environment/show-enviroment";
import { ShowDockerLogs } from "@/components/dashboard/application/logs/show";
import { DeleteService } from "@/components/dashboard/compose/delete-service";
import { ShowBackups } from "@/components/dashboard/database/backups/show-backups";
import { ShowExternalMongoCredentials } from "@/components/dashboard/mongo/general/show-external-mongo-credentials";
import { ShowGeneralMongo } from "@/components/dashboard/mongo/general/show-general-mongo";
import { ShowInternalMongoCredentials } from "@/components/dashboard/mongo/general/show-internal-mongo-credentials";
import { UpdateMongo } from "@/components/dashboard/mongo/update-mongo";
import { ContainerFreeMonitoring } from "@/components/dashboard/monitoring/free/container/show-free-container-monitoring";
import { ContainerPaidMonitoring } from "@/components/dashboard/monitoring/paid/container/show-paid-container-monitoring";
import { ShowDatabaseAdvancedSettings } from "@/components/dashboard/shared/show-database-advanced-settings";
import { MongodbIcon } from "@/components/icons/data-tools-icons";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { UseKeyboardNav } from "@/hooks/use-keyboard-nav";
import { cn } from "@/lib/utils";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type TabState = "projects" | "monitoring" | "settings" | "backups" | "advanced";

const Mongo = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const [_toggleMonitoring, _setToggleMonitoring] = useState(false);
	const { mongoId, activeTab } = props;
	const router = useRouter();
	const { projectId } = router.query;
	const [tab, setSab] = useState<TabState>(activeTab);
	const { data } = api.mongo.one.useQuery({ mongoId });

	const { data: auth } = api.user.get.useQuery();

	const { data: isCloud } = api.settings.isCloud.useQuery();

	return (
		<div className="pb-10">
			<UseKeyboardNav forPage="mongodb" />
			<BreadcrumbSidebar
				list={[
					{ name: "Projects", href: "/dashboard/projects" },
					{
						name: data?.project?.name || "",
						href: `/dashboard/project/${projectId}`,
					},
					{
						name: data?.name || "",
						href: `/dashboard/project/${projectId}/services/mongo/${mongoId}`,
					},
				]}
			/>
			<Head>
				<title>
					Database: {data?.name} - {data?.project.name} | Dokploy
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

										<MongodbIcon className="h-6 w-6 text-muted-foreground" />
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
									<UpdateMongo mongoId={mongoId} />
									{(auth?.role === "owner" || auth?.canDeleteServices) && (
										<DeleteService id={mongoId} type="mongo" />
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
										setSab(e as TabState);
										const newPath = `/dashboard/project/${projectId}/services/mongo/${mongoId}?tab=${e}`;

										router.push(newPath, undefined, { shallow: true });
									}}
								>
									<div className="flex flex-row items-center justify-between w-full gap-4 overflow-x-scroll">
										<TabsList
											className={cn(
												"md:grid md:w-fit max-md:overflow-y-scroll justify-start",
												isCloud && data?.serverId
													? "md:grid-cols-6"
													: data?.serverId
														? "md:grid-cols-5"
														: "md:grid-cols-6",
											)}
										>
											<TabsTrigger value="general">General</TabsTrigger>
											<TabsTrigger value="environment">Environment</TabsTrigger>
											<TabsTrigger value="logs">Logs</TabsTrigger>
											{((data?.serverId && isCloud) || !data?.server) && (
												<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
											)}
											<TabsTrigger value="backups">Backups</TabsTrigger>
											<TabsTrigger value="advanced">Advanced</TabsTrigger>
										</TabsList>
									</div>

									<TabsContent value="general">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowGeneralMongo mongoId={mongoId} />
											<ShowInternalMongoCredentials mongoId={mongoId} />
											<ShowExternalMongoCredentials mongoId={mongoId} />
										</div>
									</TabsContent>
									<TabsContent value="environment">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowEnvironment id={mongoId} type="mongo" />
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
														{/* {monitoring?.enabledFeatures && (
															<div className="flex flex-row border w-fit p-4 rounded-lg items-center gap-2">
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
															<ContainerPaidMonitoring
																appName={data?.appName || ""}
																baseUrl={`http://${monitoring?.serverIp}:${monitoring?.metricsConfig?.server?.port}`}
																token={
																	monitoring?.metricsConfig?.server?.token || ""
																}
															/>
														) : (
															<div> */}
														<ContainerFreeMonitoring
															appName={data?.appName || ""}
														/>
														{/* </div> */}
														{/* )} */}
													</>
												)}
											</div>
										</div>
									</TabsContent>
									<TabsContent value="logs">
										<div className="flex flex-col gap-4  pt-2.5">
											<ShowDockerLogs
												serverId={data?.serverId || ""}
												appName={data?.appName || ""}
											/>
										</div>
									</TabsContent>
									<TabsContent value="backups">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowBackups
												id={mongoId}
												databaseType="mongo"
												backupType="database"
											/>
										</div>
									</TabsContent>
									<TabsContent value="advanced">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowDatabaseAdvancedSettings id={mongoId} type="mongo" />
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

export default Mongo;
Mongo.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{ mongoId: string; activeTab: TabState }>,
) {
	const { query, params, req, res } = ctx;
	const activeTab = query.tab;

	const { user, session } = await validateRequest(req);
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
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});

	if (typeof params?.mongoId === "string") {
		try {
			await helpers.mongo.one.fetch({
				mongoId: params?.mongoId,
			});
			await helpers.settings.isCloud.prefetch();
			return {
				props: {
					trpcState: helpers.dehydrate(),
					mongoId: params?.mongoId,
					activeTab: (activeTab || "general") as TabState,
				},
			};
		} catch {
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
