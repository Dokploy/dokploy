import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import copy from "copy-to-clipboard";
import { GlobeIcon, HelpCircle, Search, ServerOff, X } from "lucide-react";
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
import { ShowClusterSettings } from "@/components/dashboard/application/advanced/cluster/show-cluster-settings";
import { AddCommand } from "@/components/dashboard/application/advanced/general/add-command";
import { ShowPorts } from "@/components/dashboard/application/advanced/ports/show-port";
import { ShowRedirects } from "@/components/dashboard/application/advanced/redirects/show-redirects";
import { ShowSecurity } from "@/components/dashboard/application/advanced/security/show-security";
import { ShowBuildServer } from "@/components/dashboard/application/advanced/show-build-server";
import { ShowResources } from "@/components/dashboard/application/advanced/show-resources";
import { ShowTraefikConfig } from "@/components/dashboard/application/advanced/traefik/show-traefik-config";
import { ShowVolumes } from "@/components/dashboard/application/advanced/volumes/show-volumes";
import { ShowDeployments } from "@/components/dashboard/application/deployments/show-deployments";
import { ShowDomains } from "@/components/dashboard/application/domains/show-domains";
import { ShowEnvironment } from "@/components/dashboard/application/environment/show";
import { ShowGeneralApplication } from "@/components/dashboard/application/general/show";
import { ShowDockerLogs } from "@/components/dashboard/application/logs/show";
import { ShowPreviewDeployments } from "@/components/dashboard/application/preview-deployments/show-preview-deployments";
import { ShowSchedules } from "@/components/dashboard/application/schedules/show-schedules";
import { UpdateApplication } from "@/components/dashboard/application/update-application";
import { ShowVolumeBackups } from "@/components/dashboard/application/volume-backups/show-volume-backups";
import { DeleteService } from "@/components/dashboard/compose/delete-service";
import { ContainerFreeMonitoring } from "@/components/dashboard/monitoring/free/container/show-free-container-monitoring";
import { ContainerPaidMonitoring } from "@/components/dashboard/monitoring/paid/container/show-paid-container-monitoring";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { BreadcrumbSidebar } from "@/components/shared/breadcrumb-sidebar";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Dropzone } from "@/components/ui/dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { UseKeyboardNav } from "@/hooks/use-keyboard-nav";
import iconNames from "@/lib/icons.json";
import { appRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type TabState =
	| "projects"
	| "settings"
	| "advanced"
	| "deployments"
	| "domains"
	| "monitoring"
	| "preview-deployments"
	| "volume-backups"
	| "icon";

const Service = (
	props: InferGetServerSidePropsType<typeof getServerSideProps>,
) => {
	const [_toggleMonitoring, _setToggleMonitoring] = useState(false);
	const { applicationId, activeTab } = props;
	const router = useRouter();
	const { projectId, environmentId } = router.query;
	const [tab, setTab] = useState<TabState>(activeTab);
	const [uploadedIcon, setUploadedIcon] = useState<string | null>(null);
	const [iconSearchQuery, setIconSearchQuery] = useState("");
	const [iconsToShow, setIconsToShow] = useState(24);

	const popularIcons = (iconNames as string[]).sort();

	const filteredIcons = popularIcons.filter((icon) =>
		icon.toLowerCase().includes(iconSearchQuery.toLowerCase()),
	);

	const displayedIcons = filteredIcons.slice(0, iconsToShow);
	const hasMoreIcons = filteredIcons.length > iconsToShow;

	useEffect(() => {
		setIconsToShow(24);
	}, [iconSearchQuery]);

	const { mutateAsync: fetchIcon } = api.application.fetchIcon.useMutation();

	const handleIconSelect = async (iconName: string) => {
		try {
			// Fetch like this so no CORS issues appear
			const result = await fetchIcon({ iconName });

			setUploadedIcon(result.icon);
			await updateApplication({
				applicationId,
				icon: result.icon,
			});
			toast.success("Icon saved successfully");
			await utils.application.one.invalidate({ applicationId });
		} catch (error) {
			toast.error("Error loading icon");
		}
	};

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

	const utils = api.useUtils();
	const { mutateAsync: updateApplication } =
		api.application.update.useMutation();

	useEffect(() => {
		if (data) {
			console.log("Application data loaded:", {
				icon: data.icon,
				hasIcon: !!data.icon,
			});
			if (data.icon) {
				setUploadedIcon(data.icon);
			} else {
				setUploadedIcon(null);
			}
		}
	}, [data]);

	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: auth } = api.user.get.useQuery();

	const { data: environments } = api.environment.byProjectId.useQuery({
		projectId: data?.environment?.project?.projectId || "",
	});
	const environmentDropdownItems =
		environments?.map((env) => ({
			name: env.name,
			href: `/dashboard/project/${projectId}/environment/${env.environmentId}`,
		})) || [];

	return (
		<div className="pb-10">
			<UseKeyboardNav forPage="application" />
			<BreadcrumbSidebar
				list={[
					{ name: "Projects", href: "/dashboard/projects" },
					{
						name: data?.environment?.project?.name || "",
						href: `/dashboard/project/${projectId}/environment/${environmentId}`,
					},
					{
						name: data?.environment?.name || "",
						dropdownItems: environmentDropdownItems,
					},
					{
						name: data?.name || "",
					},
				]}
			/>
			<Head>
				<title>
					Application: {data?.name} - {data?.environment.project.name} | Dokploy
				</title>
			</Head>
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl w-full">
					<div className="rounded-xl bg-background shadow-md ">
						<CardHeader className="flex flex-row justify-between items-center">
							<div className="flex flex-col">
								<CardTitle className="text-xl flex flex-row gap-2 items-center">
									<div className="relative flex flex-row gap-4 items-center">
										<div className="absolute -right-1 -top-2">
											<StatusTooltip status={data?.applicationStatus} />
										</div>

										{data?.icon ? (
											// biome-ignore lint/performance/noImgElement: icon is data URL or base64; Next/Image not suited for dynamic inline icons
											<img
												src={data.icon}
												alt={data.name}
												className="h-8 w-8 object-contain"
											/>
										) : (
											<GlobeIcon className="h-6 w-6 text-muted-foreground" />
										)}
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
									{(auth?.role === "owner" ||
										auth?.role === "admin" ||
										auth?.canDeleteServices) && (
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
										const newPath = `/dashboard/project/${projectId}/environment/${environmentId}/services/application/${applicationId}?tab=${e}`;
										router.push(newPath);
									}}
								>
									<div className="flex flex-row items-center justify-between w-full overflow-auto">
										<TabsList className="flex gap-8 max-md:gap-4 justify-start">
											<TabsTrigger value="general">General</TabsTrigger>
											<TabsTrigger value="environment">Environment</TabsTrigger>
											<TabsTrigger value="domains">Domains</TabsTrigger>
											<TabsTrigger value="deployments">Deployments</TabsTrigger>
											<TabsTrigger value="preview-deployments">
												Preview Deployments
											</TabsTrigger>
											<TabsTrigger value="schedules">Schedules</TabsTrigger>
											<TabsTrigger value="volume-backups">
												Volume Backups
											</TabsTrigger>
											<TabsTrigger value="logs">Logs</TabsTrigger>
											{((data?.serverId && isCloud) || !data?.server) && (
												<TabsTrigger value="monitoring">Monitoring</TabsTrigger>
											)}
											<TabsTrigger value="advanced">Advanced</TabsTrigger>
											<TabsTrigger value="icon">Icon</TabsTrigger>
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
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowDockerLogs
												appName={data?.appName || ""}
												serverId={data?.serverId || ""}
											/>
										</div>
									</TabsContent>
									<TabsContent value="schedules">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowSchedules
												id={applicationId}
												scheduleType="application"
											/>
										</div>
									</TabsContent>
									<TabsContent value="deployments" className="w-full pt-2.5">
										<div className="flex flex-col gap-4 border rounded-lg">
											<ShowDeployments
												id={applicationId}
												type="application"
												serverId={data?.serverId || ""}
												refreshToken={data?.refreshToken || ""}
											/>
										</div>
									</TabsContent>
									<TabsContent value="volume-backups" className="w-full pt-2.5">
										<div className="flex flex-col gap-4 border rounded-lg">
											<ShowVolumeBackups
												id={applicationId}
												type="application"
												serverId={data?.serverId || ""}
											/>
										</div>
									</TabsContent>
									<TabsContent value="preview-deployments" className="w-full">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowPreviewDeployments applicationId={applicationId} />
										</div>
									</TabsContent>
									<TabsContent value="domains" className="w-full">
										<div className="flex flex-col gap-4 pt-2.5">
											<ShowDomains id={applicationId} type="application" />
										</div>
									</TabsContent>
									<TabsContent value="advanced">
										<div className="flex flex-col gap-4 pt-2.5">
											<AddCommand applicationId={applicationId} />
											<ShowClusterSettings
												id={applicationId}
												type="application"
											/>
											<ShowBuildServer applicationId={applicationId} />
											<ShowResources id={applicationId} type="application" />
											<ShowVolumes id={applicationId} type="application" />
											<ShowRedirects applicationId={applicationId} />
											<ShowSecurity applicationId={applicationId} />
											<ShowPorts applicationId={applicationId} />
											<ShowTraefikConfig applicationId={applicationId} />
										</div>
									</TabsContent>
									<TabsContent value="icon">
										<div className="flex flex-col gap-4 pt-2.5">
											{uploadedIcon && (
												<div className="flex items-center gap-4 p-4 rounded-lg bg-background border">
													{/* biome-ignore lint/performance/noImgElement: uploaded icon is data URL; Next/Image not used for preview */}
													<img
														src={uploadedIcon}
														alt="Uploaded icon"
														className="size-20 object-contain rounded-lg border border-border bg-muted/50 p-2"
													/>
													<div className="flex-1">
														<p className="text-sm font-medium">Icon uploaded</p>
														<p className="text-xs text-muted-foreground mt-1">
															This icon will appear in service cards
														</p>
													</div>
													<Button
														variant="ghost"
														size="icon"
														onClick={async () => {
															try {
																await updateApplication({
																	applicationId,
																	icon: null,
																});
																setUploadedIcon(null);
																toast.success("Icon removed");
																await utils.application.one.invalidate({
																	applicationId,
																});
															} catch (error) {
																toast.error("Error removing icon");
															}
														}}
													>
														<X className="size-4" />
													</Button>
												</div>
											)}

											<div className="space-y-4">
												<div className="relative">
													<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
													<Input
														placeholder="Search icons (e.g. react, vue, docker)..."
														value={iconSearchQuery}
														onChange={(e) => setIconSearchQuery(e.target.value)}
														className="pl-9"
													/>
												</div>

												<div className="max-h-[400px] overflow-y-auto border rounded-lg p-4">
													{displayedIcons.length === 0 ? (
														<div className="text-center py-8 text-sm text-muted-foreground">
															No icons found
														</div>
													) : (
														<>
															<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
																{displayedIcons.map((iconName) => (
																	<button
																		type="button"
																		key={iconName}
																		onClick={() => handleIconSelect(iconName)}
																		className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:border-primary hover:bg-muted transition-colors group"
																	>
																		{/* biome-ignore lint/performance/noImgElement: external CDN URL and data URLs for icons; Next/Image not used for dynamic icon grid */}
																		<img
																			src={`https://cdn.svgporn.com/logos/${iconName}.svg`}
																			alt={iconName}
																			className="size-8 object-contain group-hover:scale-110 transition-transform"
																			onError={(e) => {
																				(
																					e.target as HTMLImageElement
																				).style.display = "none";
																			}}
																		/>
																		<span className="text-xs text-muted-foreground capitalize truncate w-full text-center">
																			{iconName}
																		</span>
																	</button>
																))}
															</div>
															{hasMoreIcons && (
																<div className="flex justify-center mt-4">
																	<Button
																		variant="outline"
																		onClick={() =>
																			setIconsToShow((prev) => prev + 24)
																		}
																	>
																		Load More (
																		{filteredIcons.length - iconsToShow}{" "}
																		remaining)
																	</Button>
																</div>
															)}
														</>
													)}
												</div>

												<div className="relative pt-4 border-t">
													<p className="text-sm text-muted-foreground text-center mb-4">
														or upload a custom icon
													</p>
													<div className="[&>div>div]:!h-32 [&>div>div]:!py-4 [&>div>div]:!px-6 [&>div>div>div]:!flex [&>div>div>div]:!flex-col [&>div>div>div]:!items-center [&>div>div>div]:!gap-2 [&>div>div>div>span]:!text-sm [&>div>div>div>span>svg]:!size-8">
														<Dropzone
															dropMessage="Drag & drop an icon or click to upload"
															accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
															onChange={async (files) => {
																if (!files || files.length === 0) return;
																const file = files[0];
																if (!file) return;

																const fileToProcess: File = file;

																const allowedTypes = [
																	"image/jpeg",
																	"image/jpg",
																	"image/png",
																	"image/svg+xml",
																];
																const fileExtension = fileToProcess.name
																	.split(".")
																	.pop()
																	?.toLowerCase();
																const allowedExtensions = [
																	"jpg",
																	"jpeg",
																	"png",
																	"svg",
																];

																if (
																	!allowedTypes.includes(fileToProcess.type) &&
																	!allowedExtensions.includes(
																		fileExtension || "",
																	)
																) {
																	toast.error(
																		"Only JPG, JPEG, PNG, and SVG files are allowed",
																	);
																	return;
																}

																if (fileToProcess.size > 2 * 1024 * 1024) {
																	toast.error(
																		"Image size must be less than 2MB",
																	);
																	return;
																}

																const reader = new FileReader();
																reader.onload = async (event) => {
																	const result = event.target?.result as string;
																	setUploadedIcon(result);
																	try {
																		await updateApplication({
																			applicationId,
																			icon: result,
																		});
																		toast.success("Icon saved!");
																		await utils.application.one.invalidate({
																			applicationId,
																		});
																	} catch (error) {
																		toast.error("Error saving icon");
																		setUploadedIcon(null);
																	}
																};
																reader.readAsDataURL(fileToProcess);
															}}
															classNameWrapper="border-2 border-dashed border-border hover:border-primary bg-muted/30 hover:bg-muted/50 transition-all rounded-lg"
														/>
													</div>
													<div className="mt-3 text-center text-xs text-muted-foreground">
														Supported formats: JPG, JPEG, PNG, SVG (max 2MB)
													</div>
												</div>

												<div className="pt-4 mt-6 border-t">
													<div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
														<div className="flex items-center gap-1">
															<span>Icons by</span>
															<a
																href="https://github.com/gilbarbara/logos"
																target="_blank"
																rel="noopener noreferrer"
																className="hover:text-foreground transition-colors underline"
															>
																gilbarbara/logos
															</a>
														</div>
														<div className="flex items-center gap-1">
															<span>Developer:</span>
															<a
																href="https://statsly.org/"
																target="_blank"
																rel="noopener noreferrer"
																className="hover:text-foreground transition-colors underline"
															>
																Statsly
															</a>
														</div>
													</div>
												</div>
											</div>
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
	return <DashboardLayout>{page}</DashboardLayout>;
};

export async function getServerSideProps(
	ctx: GetServerSidePropsContext<{
		applicationId: string;
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
					environmentId: params?.environmentId,
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
