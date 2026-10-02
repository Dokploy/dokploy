import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import copy from "copy-to-clipboard";
import { HelpCircle, ServerOff } from "lucide-react";
import type {
	GetServerSidePropsContext,
	InferGetServerSidePropsType,
} from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactElement, useState } from "react";
import { toast } from "sonner";
import superjson from "superjson";
import { ShowEnvironment } from "@/components/dashboard/application/environment/show-environment";
import { ShowDockerLogs } from "@/components/dashboard/application/logs/show";
import { DeleteService } from "@/components/dashboard/compose/delete-service";
import { ContainerFreeMonitoring } from "@/components/dashboard/monitoring/free/container/show-free-container-monitoring";
import { ContainerPaidMonitoring } from "@/components/dashboard/monitoring/paid/container/show-paid-container-monitoring";
import { ShowExternalObjectStorageCredentials } from "@/components/dashboard/objectstorage/general/show-external-objectstorage-credentials";
import { ShowGeneralObjectStorage } from "@/components/dashboard/objectstorage/general/show-general-objectstorage";
import { ShowInternalObjectStorageCredentials } from "@/components/dashboard/objectstorage/general/show-internal-objectstorage-credentials";
import { ShowObjectStorageAdvancedSettings } from "@/components/dashboard/objectstorage/show-object-storage-advanced-settings";
import { UpdateObjectStorage } from "@/components/dashboard/objectstorage/update-objectstorage";
import { TransferService } from "@/components/dashboard/shared/transfer-service";
import { ObjectStorageProviderIcon } from "@/components/icons/data-tools-icons";
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
import { cn } from "@/lib/utils";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";
import { useWhitelabeling } from "@/utils/hooks/use-whitelabeling";

type TabState = "general" | "environment" | "monitoring" | "logs" | "advanced";

const ObjectStorage = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const { objectStorageId, activeTab } = props;
	const router = useRouter();
	const { projectId, environmentId } = router.query;
	const [tab, setTab] = useState<TabState>(activeTab);
	const { data } = api.objectstorage.one.useQuery({ objectStorageId });
	const { data: auth } = api.user.get.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();

	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: serverIp } = api.settings.getIp.useQuery();
	const { data: environments } = api.environment.byProjectId.useQuery({
		projectId: data?.environment?.projectId || "",
	});
	const { config: whitelabeling } = useWhitelabeling();
	const appName = whitelabeling?.appName || "Dokploy";

	return (
		<div className="pb-10">
			<UseKeyboardNav forPage="objectstorage" />
			<AdvanceBreadcrumb />
			<Head>
				<title>
					Object Storage: {data?.name} - {data?.environment?.project?.name} |{" "}
					{appName}
				</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl w-full">
					<div className="rounded-xl bg-background shadow-md">
						<CardHeader className="flex flex-row justify-between items-center">
							<div className="flex flex-col">
								<CardTitle className="text-xl flex flex-row gap-2">
									<div className="relative flex flex-row gap-4">
										<div className="absolute -right-1 -top-2">
											<StatusTooltip status={data?.applicationStatus} />
										</div>
										<ObjectStorageProviderIcon
											provider={data?.provider}
											className="h-6 w-6 text-muted-foreground"
										/>
									</div>
									{data?.name}
								</CardTitle>
								{data?.description && (
									<CardDescription>{data?.description}</CardDescription>
								)}
								<div className="flex items-center gap-2 mt-1">
									<span className="text-sm text-muted-foreground">
										{data?.appName}
									</span>
									{data?.provider && (
										<Badge variant="outline" className="text-xs">
											{data.provider}
										</Badge>
									)}
								</div>
							</div>
							<div className="flex flex-col h-fit w-fit gap-2">
								<div className="flex flex-row h-fit w-fit gap-2">
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
										<TooltipProvider delayDuration={0}>
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
														You cannot deploy this service because the server is
														inactive, please upgrade your plan to add more
														servers.
													</span>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									)}
								</div>

								<div className="flex flex-row gap-2 justify-end">
									{permissions?.service.create && (
										<UpdateObjectStorage objectStorageId={objectStorageId} />
									)}
									{permissions?.service.create && (
										<TransferService
											id={objectStorageId}
											type="objectstorage"
											serverId={data?.serverId}
										/>
									)}
									{permissions?.service.delete && (
										<DeleteService id={objectStorageId} type="objectstorage" />
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
											servers to regain access to this service.
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
										const newPath = `/dashboard/project/${projectId}/environment/${environmentId}/services/objectstorage/${objectStorageId}?tab=${e}`;
										router.push(newPath, undefined, { shallow: true });
									}}
								>
									<div className="flex flex-row items-center justify-between w-full gap-4 overflow-x-auto">
										<TabsList
											className={cn(
												"md:grid md:w-fit max-md:overflow-y-scroll justify-start",
												data?.serverId ? "md:grid-cols-5" : "md:grid-cols-5",
											)}
										>
											<TabsTrigger value="general">General</TabsTrigger>
											{permissions?.envVars.read && (
												<TabsTrigger value="environment">
													Environment
												</TabsTrigger>
											)}
											{permissions?.logs.read && (
												<TabsTrigger value="logs">Logs</TabsTrigger>
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
											<ShowGeneralObjectStorage
												objectStorageId={objectStorageId}
											/>
											<ShowInternalObjectStorageCredentials
												objectStorageId={objectStorageId}
											/>
											<ShowExternalObjectStorageCredentials
												objectStorageId={objectStorageId}
											/>
										</div>
									</TabsContent>
									{permissions?.envVars.read && (
										<TabsContent value="environment">
											<div className="flex flex-col gap-4 pt-2.5">
												<ShowEnvironment
													id={objectStorageId}
													type="objectstorage"
												/>
											</div>
										</TabsContent>
									)}
									{permissions?.monitoring.read && (
										<TabsContent value="monitoring">
											<div className="pt-2.5">
												<div className="flex flex-col gap-4 border rounded-lg p-6">
													{data?.serverId && isCloud ? (
														<ContainerPaidMonitoring
															appName={data?.appName || ""}
															baseUrl={`${
																data?.serverId
																	? `http://${data?.server?.ipAddress}:${data?.server?.metricsConfig?.server?.port}`
																	: "http://localhost:4500"
															}`}
															token={
																data?.server?.metricsConfig?.server?.token || ""
															}
														/>
													) : (
														<ContainerFreeMonitoring
															appName={data?.appName || ""}
														/>
													)}
												</div>
											</div>
										</TabsContent>
									)}
									{permissions?.logs.read && (
										<TabsContent value="logs">
											<div className="flex flex-col gap-4 pt-2.5">
												<ShowDockerLogs
													serverId={data?.serverId || ""}
													appName={data?.appName || ""}
													serviceId={data?.objectStorageId}
												/>
											</div>
										</TabsContent>
									)}
									{permissions?.service.create && (
										<TabsContent value="advanced">
											<div className="flex flex-col gap-4 pt-2.5">
												<ShowObjectStorageAdvancedSettings
													id={objectStorageId}
												/>
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

export default ObjectStorage;
ObjectStorage.getLayout = (page: ReactElement) => {
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{
		objectStorageId: string;
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

	if (typeof params?.objectStorageId === "string") {
		try {
			await helpers.objectstorage.one.fetch({
				objectStorageId: params?.objectStorageId,
			});
			await helpers.settings.isCloud.prefetch();

			return {
				props: {
					trpcState: helpers.dehydrate(),
					objectStorageId: params?.objectStorageId,
					activeTab: (activeTab || "general") as TabState,
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
