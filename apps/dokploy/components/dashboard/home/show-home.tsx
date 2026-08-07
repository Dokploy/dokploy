import type { inferRouterOutputs } from "@trpc/server";
import { formatDistanceToNow } from "date-fns";
import {
	Activity,
	AlertTriangle,
	ArrowRight,
	Boxes,
	CheckCircle2,
	Folder,
	HardDrive,
	Loader2,
	type LucideIcon,
	Monitor,
	Rocket,
	Server,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/api";

type HomeStats = inferRouterOutputs<AppRouter>["project"]["homeStats"];
type HomeSummary = inferRouterOutputs<AppRouter>["deployment"]["homeSummary"];
type DeploymentRow = HomeSummary["recent"][number];
type ErroredService = HomeStats["erroredServices"][number];

const statusVariants: Record<
	string,
	| "default"
	| "secondary"
	| "destructive"
	| "outline"
	| "yellow"
	| "green"
	| "red"
> = {
	running: "yellow",
	done: "green",
	error: "red",
	cancelled: "outline",
	idle: "secondary",
};

const serviceTypePath: Record<ErroredService["type"], string> = {
	application: "application",
	compose: "compose",
	libsql: "libsql",
	mariadb: "mariadb",
	mongo: "mongo",
	mysql: "mysql",
	postgres: "postgres",
	redis: "redis",
};

function getServiceInfo(d: DeploymentRow) {
	const app = d.application;
	const comp = d.compose;
	const serverName: string =
		d.server?.name ?? app?.server?.name ?? comp?.server?.name ?? "Dokploy";
	if (app?.environment?.project && app.environment) {
		return {
			name: app.name,
			environment: app.environment.name,
			projectName: app.environment.project.name,
			serverName,
			href: `/dashboard/project/${app.environment.project.projectId}/environment/${app.environment.environmentId}/services/application/${app.applicationId}`,
		};
	}
	if (comp?.environment?.project && comp.environment) {
		return {
			name: comp.name,
			environment: comp.environment.name,
			projectName: comp.environment.project.name,
			serverName,
			href: `/dashboard/project/${comp.environment.project.projectId}/environment/${comp.environment.environmentId}/services/compose/${comp.composeId}`,
		};
	}
	return null;
}

function erroredServiceHref(service: ErroredService) {
	return `/dashboard/project/${service.projectId}/environment/${service.environmentId}/services/${serviceTypePath[service.type]}/${service.id}`;
}

function StatCard({
	label,
	value,
	delta,
	loading,
}: {
	label: string;
	value: string;
	delta?: string;
	loading?: boolean;
}) {
	return (
		<div className="rounded-xl border bg-background p-5 min-h-[140px] flex flex-col justify-between">
			<span className="text-xs uppercase tracking-wider text-muted-foreground">
				{label}
			</span>
			<div className="flex flex-col gap-1">
				{loading ? (
					<Skeleton className="h-9 w-16" />
				) : (
					<span className="text-3xl font-semibold tracking-tight">{value}</span>
				)}
				{loading ? (
					<Skeleton className="h-3 w-28" />
				) : (
					delta && (
						<span className="text-xs text-muted-foreground">{delta}</span>
					)
				)}
			</div>
		</div>
	);
}

function StatusListCard({
	label,
	items,
	loading,
}: {
	label: string;
	items: { dotClass: string; label: string; count: number }[];
	loading?: boolean;
}) {
	return (
		<div className="rounded-xl border bg-background p-5 min-h-[140px] flex flex-col gap-3">
			<span className="text-xs uppercase tracking-wider text-muted-foreground">
				{label}
			</span>
			{loading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			) : (
				<ul className="flex flex-col gap-1.5">
					{items.map((item) => (
						<li key={item.label} className="flex items-center gap-2.5 text-sm">
							<span
								className={`size-2 rounded-full shrink-0 ${item.dotClass}`}
								aria-hidden
							/>
							<span className="font-semibold tabular-nums w-8">
								{item.count}
							</span>
							<span className="text-muted-foreground">{item.label}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function SectionHeader({
	icon: Icon,
	title,
	href,
	linkLabel = "view all →",
}: {
	icon: LucideIcon;
	title: string;
	href?: string;
	linkLabel?: string;
}) {
	return (
		<div className="flex items-center justify-between px-5 py-4 border-b">
			<div className="flex items-center gap-2">
				<Icon className="size-4 text-muted-foreground" />
				<h2 className="text-sm font-semibold">{title}</h2>
			</div>
			{href && (
				<Link
					href={href}
					className="text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					{linkLabel}
				</Link>
			)}
		</div>
	);
}

function EmptyBlock({
	icon: Icon,
	message,
	compact,
}: {
	icon: LucideIcon;
	message: string;
	compact?: boolean;
}) {
	return (
		<div
			className={`flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground p-10 ${compact ? "min-h-[160px]" : "min-h-[280px]"}`}
		>
			<Icon className="size-8 opacity-40" />
			<span>{message}</span>
		</div>
	);
}

function DeploymentList({
	items,
	emptyMessage,
}: {
	items: DeploymentRow[];
	emptyMessage: string;
}) {
	const rows = items
		.map((d) => ({ d, info: getServiceInfo(d) }))
		.filter(
			(
				row,
			): row is {
				d: DeploymentRow;
				info: NonNullable<ReturnType<typeof getServiceInfo>>;
			} => !!row.info,
		);

	if (rows.length === 0) {
		return <EmptyBlock icon={Rocket} message={emptyMessage} compact />;
	}

	return (
		<ul className="divide-y">
			{rows.map(({ d, info }) => {
				const status = d.status ?? "idle";
				return (
					<li key={d.deploymentId}>
						<Link
							href={info.href}
							className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors"
						>
							<div className="flex flex-col min-w-0 flex-1">
								<span className="text-sm truncate">{info.name}</span>
								<span className="text-xs text-muted-foreground truncate">
									{info.projectName} · {info.environment}
								</span>
							</div>
							<span className="text-xs text-muted-foreground w-32 hidden lg:flex items-center justify-end gap-1.5 truncate">
								<Server className="size-3 shrink-0" />
								<span className="truncate">{info.serverName}</span>
							</span>
							<Badge
								variant={statusVariants[status] ?? "secondary"}
								className="capitalize shrink-0"
							>
								{status}
							</Badge>
							<span className="text-xs text-muted-foreground w-24 text-right hidden md:inline shrink-0">
								{formatDistanceToNow(new Date(d.createdAt), {
									addSuffix: true,
								})}
							</span>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}

function deployDelta(last7d: number, prev7d: number) {
	if (prev7d > 0) {
		const pct = Math.round(((last7d - prev7d) / prev7d) * 100);
		return `${pct >= 0 ? "+" : ""}${pct}% vs prev 7d`;
	}
	if (last7d > 0) return "no prior data";
	return "no activity yet";
}

export const ShowHome = () => {
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: activeOrganization, isLoading: orgLoading } =
		api.organization.active.useQuery();
	const hasOrg = !!activeOrganization;

	const { data: auth, isLoading: authLoading } = api.user.get.useQuery(
		undefined,
		{
			enabled: hasOrg,
		},
	);
	const { data: homeStats, isLoading: statsLoading } =
		api.project.homeStats.useQuery(undefined, {
			enabled: hasOrg,
		});
	const { data: permissions, isLoading: permissionsLoading } =
		api.user.getPermissions.useQuery(undefined, {
			enabled: hasOrg,
		});

	const canReadDeployments = !!permissions?.deployment.read;
	const canReadServers = !!permissions?.server.read;
	const canReadDocker = !!permissions?.docker.read;
	const canReadMonitoring = !!permissions?.monitoring.read;
	const isAdmin = auth?.role === "owner" || auth?.role === "admin";

	const { data: deploySummary, isLoading: deployLoading } =
		api.deployment.homeSummary.useQuery(undefined, {
			enabled: hasOrg && canReadDeployments,
			refetchInterval: 10000,
		});

	const { data: servers, isLoading: serversLoading } = api.server.all.useQuery(
		undefined,
		{
			enabled: hasOrg && canReadServers,
		},
	);

	const { data: queue, isLoading: queueLoading } =
		api.deployment.queueList.useQuery(undefined, {
			enabled: hasOrg && canReadDeployments,
			refetchInterval: 10000,
		});

	const { data: dokployVersion } = api.settings.getDokployVersion.useQuery();
	const { data: infraHealth, isLoading: healthLoading } =
		api.settings.checkInfrastructureHealth.useQuery(undefined, {
			enabled: hasOrg && !!isAdmin && isCloud === false,
			retry: false,
		});

	const firstName = auth?.user?.firstName?.trim();
	const loadingStats =
		orgLoading ||
		(hasOrg && (statsLoading || authLoading || permissionsLoading));

	const totals = homeStats ?? {
		projects: 0,
		environments: 0,
		applications: 0,
		compose: 0,
		databases: 0,
		services: 0,
	};
	const statusBreakdown = homeStats?.status ?? {
		running: 0,
		error: 0,
		idle: 0,
	};

	const deployStats = deploySummary?.stats;
	const failedDeploys = deploySummary?.failed ?? [];
	const recentDeployments = deploySummary?.recent ?? [];
	const erroredServices = homeStats?.erroredServices ?? [];
	const recentProjects = homeStats?.recentProjects ?? [];
	const dokployHostServices = homeStats?.dokployHostServices ?? 0;
	const servicesByServerId = homeStats?.servicesByServerId ?? {};

	const serverSummary = useMemo(() => {
		if (!servers) return { total: 0, active: 0, inactive: 0, services: 0 };
		let active = 0;
		let inactive = 0;
		let services = 0;
		for (const s of servers) {
			if (s.serverStatus === "inactive") inactive++;
			else active++;
			services += servicesByServerId[s.serverId] ?? s.totalSum ?? 0;
		}
		return { total: servers.length, active, inactive, services };
	}, [servers, servicesByServerId]);

	const attentionCount =
		erroredServices.length + (canReadDeployments ? failedDeploys.length : 0);
	const showAttention = !loadingStats && attentionCount > 0;
	const showServerSummary = !isCloud || canReadServers;

	if (!orgLoading && !hasOrg) {
		return (
			<div className="w-full">
				<Card className="h-full bg-sidebar p-2.5 rounded-xl min-h-[85vh]">
					<div className="rounded-xl bg-background shadow-md p-6 flex flex-col items-center justify-center gap-3 min-h-[70vh] text-center">
						<Server className="size-8 text-muted-foreground opacity-40" />
						<h1 className="text-xl font-semibold tracking-tight">
							No organization selected
						</h1>
						<p className="text-sm text-muted-foreground max-w-md">
							Select or create an organization to view your dashboard overview.
						</p>
					</div>
				</Card>
			</div>
		);
	}

	return (
		<div className="w-full">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl min-h-[85vh]">
				<div className="rounded-xl bg-background shadow-md p-6 flex flex-col gap-6 h-full">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
						<div className="flex flex-col gap-1">
							<h1 className="text-3xl font-semibold tracking-tight">
								{firstName ? `Welcome back, ${firstName}` : "Welcome back"}
							</h1>
							<p className="text-sm text-muted-foreground">
								Overview of your projects, services, and deployments
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{canReadDeployments && (
								<Button asChild variant="outline" className="w-fit">
									<Link href="/dashboard/deployments">
										Deployments
										<Rocket className="size-4" />
									</Link>
								</Button>
							)}
							<Button asChild variant="secondary" className="w-fit">
								<Link href="/dashboard/projects">
									Go to projects
									<ArrowRight className="size-4" />
								</Link>
							</Button>
						</div>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						<StatCard
							label="Projects"
							value={String(totals.projects)}
							delta={`${totals.environments} ${totals.environments === 1 ? "environment" : "environments"}`}
							loading={loadingStats}
						/>
						<StatCard
							label="Services"
							value={String(totals.services)}
							delta={`${totals.applications} apps · ${totals.compose} compose · ${totals.databases} db`}
							loading={loadingStats}
						/>
						<StatCard
							label="Deploys / 7d"
							value={
								canReadDeployments ? String(deployStats?.last7d ?? 0) : "—"
							}
							delta={
								canReadDeployments
									? deployDelta(
											deployStats?.last7d ?? 0,
											deployStats?.prev7d ?? 0,
										)
									: "no deployment access"
							}
							loading={loadingStats || (canReadDeployments && deployLoading)}
						/>
						<StatusListCard
							label="Status"
							loading={loadingStats}
							items={[
								{
									dotClass: "bg-emerald-500",
									label: "running",
									count: statusBreakdown.running,
								},
								{
									dotClass: "bg-red-500",
									label: "errored",
									count: statusBreakdown.error,
								},
								{
									dotClass: "bg-muted-foreground/40",
									label: "idle",
									count: statusBreakdown.idle,
								},
							]}
						/>
					</div>

					{showAttention && (
						<div className="rounded-xl border border-destructive/20 bg-destructive/5">
							<div className="flex items-center gap-2 px-5 py-4 border-b border-destructive/15">
								<AlertTriangle className="size-4 text-destructive" />
								<h2 className="text-sm font-semibold">Needs attention</h2>
								{canReadDeployments && (deployStats?.failed7d ?? 0) > 0 && (
									<Badge variant="red" className="ml-1">
										{deployStats?.failed7d} failed / 7d
									</Badge>
								)}
							</div>
							<div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-destructive/15">
								{erroredServices.length > 0 && (
									<div
										className={
											failedDeploys.length === 0 ? "lg:col-span-2" : ""
										}
									>
										<div className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
											Errored services
										</div>
										<ul className="divide-y divide-destructive/10">
											{erroredServices.map((service) => (
												<li key={`${service.type}-${service.id}`}>
													<Link
														href={erroredServiceHref(service)}
														className="flex items-center gap-3 px-5 py-3 hover:bg-destructive/10 transition-colors"
													>
														<Badge
															variant="red"
															className="capitalize shrink-0"
														>
															{service.type}
														</Badge>
														<div className="flex flex-col min-w-0 flex-1">
															<span className="text-sm truncate">
																{service.name}
															</span>
															<span className="text-xs text-muted-foreground truncate">
																{service.projectName} ·{" "}
																{service.environmentName}
															</span>
														</div>
														<ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
													</Link>
												</li>
											))}
										</ul>
									</div>
								)}
								{canReadDeployments && failedDeploys.length > 0 && (
									<div
										className={
											erroredServices.length === 0 ? "lg:col-span-2" : ""
										}
									>
										<div className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
											Failed deployments
										</div>
										<DeploymentList
											items={failedDeploys}
											emptyMessage="No failed deployments."
										/>
									</div>
								)}
							</div>
						</div>
					)}

					{showServerSummary && (
						<div className="rounded-xl border bg-background">
							<SectionHeader
								icon={HardDrive}
								title="Server summary"
								href={
									canReadServers
										? "/dashboard/settings/servers"
										: !isCloud
											? "/dashboard/settings/server"
											: undefined
								}
								linkLabel={canReadServers ? "manage servers →" : "web server →"}
							/>
							{(statsLoading || (canReadServers && serversLoading)) && (
								<div className="flex items-center justify-center gap-2 min-h-[140px] text-sm text-muted-foreground">
									<Loader2 className="size-4 animate-spin" />
									Loading servers…
								</div>
							)}
							{!statsLoading && !(canReadServers && serversLoading) && (
								<div className="flex flex-col gap-4 p-4">
									<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
										<div className="rounded-lg border p-3 flex flex-col gap-1">
											<span className="text-[11px] uppercase tracking-wider text-muted-foreground">
												Hosts
											</span>
											<span className="text-2xl font-semibold tabular-nums">
												{(isCloud ? 0 : 1) + serverSummary.total}
											</span>
											<span className="text-xs text-muted-foreground">
												{isCloud
													? "remote only"
													: `${serverSummary.total} remote`}
											</span>
										</div>
										<div className="rounded-lg border p-3 flex flex-col gap-1">
											<span className="text-[11px] uppercase tracking-wider text-muted-foreground">
												On Dokploy
											</span>
											<span className="text-2xl font-semibold tabular-nums">
												{isCloud ? "—" : dokployHostServices}
											</span>
											<span className="text-xs text-muted-foreground">
												{isCloud ? "cloud host" : "local services"}
											</span>
										</div>
										<div className="rounded-lg border p-3 flex flex-col gap-1">
											<span className="text-[11px] uppercase tracking-wider text-muted-foreground">
												On remotes
											</span>
											<span className="text-2xl font-semibold tabular-nums">
												{serverSummary.services}
											</span>
											<span className="text-xs text-muted-foreground">
												{serverSummary.active} active
												{serverSummary.inactive > 0
													? ` · ${serverSummary.inactive} inactive`
													: ""}
											</span>
										</div>
										<div className="rounded-lg border p-3 flex flex-col gap-1">
											<span className="text-[11px] uppercase tracking-wider text-muted-foreground">
												Version
											</span>
											<span className="text-2xl font-semibold tabular-nums truncate">
												{dokployVersion ?? "—"}
											</span>
											<span className="text-xs text-muted-foreground">
												Dokploy
											</span>
										</div>
									</div>

									{!isCloud && isAdmin && (
										<div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5">
											<span className="text-xs font-medium text-muted-foreground mr-1">
												Infrastructure
											</span>
											{healthLoading ? (
												<span className="text-xs text-muted-foreground flex items-center gap-1.5">
													<Loader2 className="size-3 animate-spin" />
													Checking…
												</span>
											) : infraHealth ? (
												(
													[
														["Postgres", infraHealth.postgres],
														["Redis", infraHealth.redis],
														["Traefik", infraHealth.traefik],
													] as const
												).map(([name, service]) => (
													<span
														key={name}
														className="inline-flex items-center gap-1.5 text-xs"
													>
														{service.status === "healthy" ? (
															<CheckCircle2 className="size-3.5 text-emerald-500" />
														) : (
															<XCircle className="size-3.5 text-destructive" />
														)}
														{name}
													</span>
												))
											) : (
												<span className="text-xs text-muted-foreground">
													Unavailable
												</span>
											)}
										</div>
									)}

									<ul className="divide-y rounded-lg border">
										{!isCloud && (
											<li>
												<Link
													href={
														canReadMonitoring
															? "/dashboard/monitoring"
															: "/dashboard/settings/server"
													}
													className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
												>
													<span className="flex size-8 items-center justify-center rounded-md bg-muted shrink-0">
														<Server className="size-4 text-muted-foreground" />
													</span>
													<div className="flex flex-col min-w-0 flex-1">
														<span className="text-sm font-medium truncate">
															Dokploy host
														</span>
														<span className="text-xs text-muted-foreground truncate">
															Local web server
														</span>
													</div>
													<span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
														{dokployHostServices}{" "}
														{dokployHostServices === 1 ? "service" : "services"}
													</span>
													<Badge variant="green" className="shrink-0">
														local
													</Badge>
													<ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
												</Link>
											</li>
										)}
										{canReadServers &&
											servers?.map((server) => {
												const serviceCount =
													servicesByServerId[server.serverId] ??
													server.totalSum ??
													0;
												const inactive = server.serverStatus === "inactive";
												return (
													<li key={server.serverId}>
														<Link
															href="/dashboard/settings/servers"
															className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
														>
															<span className="flex size-8 items-center justify-center rounded-md bg-muted shrink-0">
																<Server className="size-4 text-muted-foreground" />
															</span>
															<div className="flex flex-col min-w-0 flex-1">
																<span className="text-sm font-medium truncate">
																	{server.name}
																</span>
																<span className="text-xs text-muted-foreground truncate">
																	{server.ipAddress || "Remote server"}
																	{server.serverType === "build"
																		? " · build"
																		: ""}
																</span>
															</div>
															<span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
																{serviceCount}{" "}
																{serviceCount === 1 ? "service" : "services"}
															</span>
															<Badge
																variant={inactive ? "red" : "green"}
																className="capitalize shrink-0"
															>
																{server.serverStatus ?? "active"}
															</Badge>
															<ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
														</Link>
													</li>
												);
											})}
										{canReadServers && serverSummary.total === 0 && (
											<li className="px-4 py-3 text-sm text-muted-foreground">
												No remote servers yet.{" "}
												<Link
													href="/dashboard/settings/servers"
													className="text-foreground underline-offset-4 hover:underline"
												>
													Add a server
												</Link>{" "}
												to deploy remotely.
											</li>
										)}
									</ul>
								</div>
							)}
						</div>
					)}

					<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
						<div className="rounded-xl border bg-background xl:col-span-2">
							<SectionHeader
								icon={Rocket}
								title="Recent deployments"
								href={canReadDeployments ? "/dashboard/deployments" : undefined}
							/>
							{canReadDeployments && (deployStats?.running ?? 0) > 0 && (
								<div className="px-5 py-2 border-b bg-muted/30">
									<Badge variant="yellow">
										{deployStats?.running} currently deploying
									</Badge>
								</div>
							)}
							{permissionsLoading || (canReadDeployments && deployLoading) ? (
								<div className="flex items-center justify-center gap-2 min-h-[280px] text-sm text-muted-foreground">
									<Loader2 className="size-4 animate-spin" />
									Loading deployments…
								</div>
							) : !canReadDeployments ? (
								<EmptyBlock
									icon={Rocket}
									message="You do not have permission to view deployments."
								/>
							) : (
								<DeploymentList
									items={recentDeployments}
									emptyMessage="No deployments yet."
								/>
							)}
						</div>

						<div className="flex flex-col gap-4">
							{canReadDeployments && (
								<div className="rounded-xl border bg-background">
									<SectionHeader
										icon={Activity}
										title="Deploy queue"
										href="/dashboard/deployments"
										linkLabel="open queue →"
									/>
									{queueLoading ? (
										<div className="flex items-center justify-center gap-2 min-h-[120px] text-sm text-muted-foreground">
											<Loader2 className="size-4 animate-spin" />
										</div>
									) : (
										<div className="px-5 py-5 flex flex-col gap-2">
											<span className="text-3xl font-semibold tracking-tight tabular-nums">
												{queue?.length ?? 0}
											</span>
											<span className="text-xs text-muted-foreground">
												{(queue?.length ?? 0) === 1
													? "job in queue"
													: "jobs in queue"}
											</span>
										</div>
									)}
								</div>
							)}

							{!isCloud && canReadMonitoring && (
								<div className="rounded-xl border bg-background flex-1">
									<SectionHeader
										icon={Monitor}
										title="Monitoring"
										href="/dashboard/monitoring"
										linkLabel="open →"
									/>
									<div className="px-5 py-4 flex flex-col gap-3">
										<p className="text-sm text-muted-foreground">
											Host and container CPU, memory, and disk metrics.
										</p>
										<div className="flex flex-wrap gap-2">
											<Badge variant="blank">
												{dokployHostServices} on host
											</Badge>
											{serverSummary.total > 0 && (
												<Badge variant="blank">
													{serverSummary.total} remotes
												</Badge>
											)}
										</div>
									</div>
								</div>
							)}
						</div>
					</div>

					<div className="rounded-xl border bg-background">
						<SectionHeader
							icon={Folder}
							title="Recent projects"
							href="/dashboard/projects"
						/>
						{statsLoading ? (
							<div className="flex items-center justify-center gap-2 min-h-[160px] text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								Loading projects…
							</div>
						) : recentProjects.length === 0 ? (
							<EmptyBlock
								icon={Folder}
								message="No projects yet. Create one to get started."
								compact
							/>
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
								{recentProjects.map((project) => {
									const href = project.defaultEnvironmentId
										? `/dashboard/project/${project.projectId}/environment/${project.defaultEnvironmentId}`
										: `/dashboard/project/${project.projectId}`;
									return (
										<Link
											key={project.projectId}
											href={href}
											className="rounded-xl border p-4 hover:bg-muted/40 transition-colors flex flex-col gap-3 min-h-[120px]"
										>
											<div className="flex items-start justify-between gap-2">
												<span className="text-sm font-medium truncate">
													{project.name}
												</span>
												<Boxes className="size-4 text-muted-foreground shrink-0" />
											</div>
											{project.description && (
												<p className="text-xs text-muted-foreground line-clamp-2">
													{project.description}
												</p>
											)}
											<div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
												<span>
													{project.services}{" "}
													{project.services === 1 ? "service" : "services"}
												</span>
												<span>
													{formatDistanceToNow(new Date(project.createdAt), {
														addSuffix: true,
													})}
												</span>
											</div>
										</Link>
									);
								})}
							</div>
						)}
					</div>

					{(canReadDocker ||
						canReadServers ||
						(!isCloud && canReadMonitoring)) && (
						<div className="flex flex-wrap gap-2">
							{!isCloud && canReadMonitoring && (
								<Button asChild variant="outline" size="sm">
									<Link href="/dashboard/monitoring">Monitoring</Link>
								</Button>
							)}
							{canReadServers && (
								<Button asChild variant="outline" size="sm">
									<Link href="/dashboard/settings/servers">Servers</Link>
								</Button>
							)}
							{canReadDocker && (
								<Button asChild variant="outline" size="sm">
									<Link href="/dashboard/docker">Docker</Link>
								</Button>
							)}
							{canReadDeployments && (
								<Button asChild variant="outline" size="sm">
									<Link href="/dashboard/deployments">All deployments</Link>
								</Button>
							)}
						</div>
					)}
				</div>
			</Card>
		</div>
	);
};
