import { format } from "date-fns";
import {
	AlertTriangle,
	Calendar as CalendarIcon,
	Cpu,
	Download,
	HardDrive,
	Info,
	Loader2,
	Network,
	RefreshCw,
	Server as ServerIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CodeEditor } from "@/components/shared/code-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

interface Props {
	serverId?: string;
}

const bytesToGb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);
const nanoCpusToCores = (nanoCpus: number) => (nanoCpus / 1e9).toFixed(2);
const pct = (used: number, total: number) =>
	Math.min(100, Math.round((used / (total || 1)) * 100));

const SINCE_HOURS_OPTIONS = [
	{ label: "Last hour", value: 1 },
	{ label: "Last 6 hours", value: 6 },
	{ label: "Last 24 hours", value: 24 },
	{ label: "Last 7 days", value: 168 },
];

const getDefaultDateRange = () => {
	const to = new Date();
	const from = new Date();
	from.setDate(from.getDate() - 7);
	return { from, to };
};

const getServiceInfo = (deployment: {
	application?: {
		applicationId: string;
		name: string;
		environment?: {
			environmentId: string;
			project?: { projectId: string; name: string };
		};
	} | null;
	compose?: {
		composeId: string;
		name: string;
		environment?: {
			environmentId: string;
			project?: { projectId: string; name: string };
		};
	} | null;
}) => {
	const app = deployment.application;
	const comp = deployment.compose;
	if (app?.environment?.project) {
		return {
			name: app.name,
			projectId: app.environment.project.projectId,
			projectName: app.environment.project.name,
			href: `/dashboard/project/${app.environment.project.projectId}/environment/${app.environment.environmentId}/services/application/${app.applicationId}`,
		};
	}
	if (comp?.environment?.project) {
		return {
			name: comp.name,
			projectId: comp.environment.project.projectId,
			projectName: comp.environment.project.name,
			href: `/dashboard/project/${comp.environment.project.projectId}/environment/${comp.environment.environmentId}/services/compose/${comp.composeId}`,
		};
	}
	return null;
};

export const ShowHealth = ({ serverId }: Props) => {
	const [sinceHours, setSinceHours] = useState(24);
	const {
		data: health,
		isFetching,
		refetch,
		isFetched,
	} = api.docker.getServerHealth.useQuery(
		{ serverId, sinceHours },
		{ enabled: false },
	);

	const [dateRange, setDateRange] = useState<{
		from: Date | undefined;
		to: Date | undefined;
	}>(() => getDefaultDateRange());
	const [hasCustomRange, setHasCustomRange] = useState(false);
	const [projectId, setProjectId] = useState<string | undefined>(undefined);
	const { data: projects } = api.project.all.useQuery();

	const {
		data: failedDeployments,
		isFetching: isFetchingFailed,
		refetch: refetchFailed,
		isFetched: isFetchedFailed,
	} = api.deployment.allFailedCentralized.useQuery(
		{
			dateFrom: dateRange.from?.toISOString(),
			dateTo: dateRange.to?.toISOString(),
			projectId,
		},
		{ enabled: false },
	);

	// Mount-only: filter changes require an explicit Check click, not an auto-refetch.
	useEffect(() => {
		refetch();
		refetchFailed();
	}, []);

	// Refreshes the default range's "to" bound to now right before checking.
	const [checkFailedTick, setCheckFailedTick] = useState(0);
	useEffect(() => {
		if (checkFailedTick > 0) refetchFailed();
	}, [checkFailedTick]);
	const handleCheckFailed = () => {
		if (!hasCustomRange) setDateRange(getDefaultDateRange());
		setCheckFailedTick((t) => t + 1);
	};

	const memUsedPct = health
		? pct(health.resources.memUsedBytes, health.resources.memTotalBytes)
		: 0;
	const diskUsedPct = health
		? pct(health.disk.usedBytes, health.disk.totalBytes)
		: 0;
	const inotifyUsedPct = health
		? pct(health.inotify.currentInstances, health.inotify.maxInstances)
		: 0;

	const daemonLogsWindowText = health?.daemonLogsWindow
		? `Logs from ${new Date(health.daemonLogsWindow.fromEpoch * 1000).toLocaleString()} to ${new Date(health.daemonLogsWindow.toEpoch * 1000).toLocaleString()}`
		: null;
	const daemonErrorsText = [
		daemonLogsWindowText,
		health && health.daemonErrors.length > 0
			? health.daemonErrors.join("\n")
			: "(no daemon errors matched in this window)",
	]
		.filter(Boolean)
		.join("\n\n");

	const buildHealthReport = () => {
		if (!health) return "";
		const lines: string[] = [];
		lines.push("# Dokploy server health report");
		lines.push(`Generated: ${new Date(health.checkedAt).toLocaleString()}`);
		lines.push(
			`Window: ${SINCE_HOURS_OPTIONS.find((o) => o.value === sinceHours)?.label ?? `${sinceHours}h`}`,
		);
		lines.push("");

		lines.push("## Containers & services");
		lines.push(`Containers: ${health.containers.containerCount}`);
		lines.push(`Swarm services: ${health.containers.serviceCount}`);
		lines.push("");

		lines.push("## Host resources");
		lines.push(
			`Memory: ${bytesToGb(health.resources.memUsedBytes)} / ${bytesToGb(health.resources.memTotalBytes)} GB`,
		);
		lines.push(`CPU cores: ${health.resources.cpuCount}`);
		lines.push("");

		lines.push("## Disk (/)");
		lines.push(
			`${bytesToGb(health.disk.usedBytes)} / ${bytesToGb(health.disk.totalBytes)} GB`,
		);
		lines.push("");

		lines.push("## Inotify");
		lines.push(
			`max_user_instances: ${health.inotify.currentInstances} / ${health.inotify.maxInstances}`,
		);
		lines.push(`max_user_watches: ${health.inotify.maxWatches}`);
		lines.push(`max_queued_events: ${health.inotify.maxQueuedEvents}`);
		lines.push(
			`Persisted in sysctl: ${health.inotify.persisted ? "yes" : "no"}`,
		);
		lines.push("");

		lines.push("## Docker networks");
		lines.push(`Total networks: ${health.dockerNetworks.count}`);
		if (health.dockerNetworks.addressPools) {
			lines.push(
				`default-address-pools: ${JSON.stringify(health.dockerNetworks.addressPools)}`,
			);
		}
		if (health.dockerNetworks.usageError) {
			lines.push(
				`Could not read network IP usage: ${health.dockerNetworks.usageError}`,
			);
		} else if (health.dockerNetworks.usage.length > 0) {
			lines.push("");
			lines.push(
				"| Network | Driver | Subnet | IPs in use | Capacity | Usage |",
			);
			lines.push("|---|---|---|---|---|---|");
			for (const n of health.dockerNetworks.usage) {
				lines.push(
					`| ${n.name} | ${n.driver} | ${n.subnet ?? "auto"} | ${n.containersInUse} | ${n.capacity ?? "—"} | ${n.percentUsed ?? "—"}% |`,
				);
			}
		}
		lines.push("");

		if (health.reservation) {
			lines.push("## Memory/CPU reservation");
			lines.push(
				`Reserved memory: ${bytesToGb(health.reservation.memoryReservedBytes)} GB`,
			);
			lines.push(
				`Reserved CPU: ${nanoCpusToCores(health.reservation.cpuReservedNanoCpus)} cores`,
			);
			lines.push(`Across ${health.reservation.appCount} Application services`);
			if (health.reservation.unsupportedComposeCount > 0) {
				lines.push(
					`${health.reservation.unsupportedComposeCount} Compose service(s) not included (not tracked per-service)`,
				);
			}
			lines.push("");
		}

		lines.push("## Failed deployments");
		if (failedDeployments && failedDeployments.length > 0) {
			for (const d of failedDeployments) {
				const info = getServiceInfo(d);
				const cause = d.classification?.label ?? "Unclassified";
				lines.push(
					`- ${format(new Date(d.createdAt), "PPp")} | ${info?.name ?? "—"} | ${info?.projectName ?? "—"} | ${cause}`,
				);
			}
		} else {
			lines.push("(none checked, or none in range)");
		}
		lines.push("");

		lines.push("## Docker daemon errors (raw)");
		lines.push("```");
		lines.push(daemonErrorsText);
		lines.push("```");

		return lines.join("\n");
	};

	const handleDownload = () => {
		const report = buildHealthReport();
		if (!report) return;
		const blob = new Blob([report], { type: "text/markdown" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `dokploy-health-report-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex flex-col gap-4 w-full">
			<Card className="bg-sidebar p-2.5 rounded-xl w-full">
				<div className="rounded-xl bg-background shadow-md p-6 flex flex-col gap-4">
					<div className="flex items-center justify-between gap-4 flex-wrap">
						<div>
							<h3 className="text-lg font-medium">Server diagnostics</h3>
							<p className="text-sm text-muted-foreground max-w-xl">
								Runs a read-only check over SSH (inotify limits, disk, Docker
								network pool, daemon errors). Nothing runs automatically — click
								to check.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Select
								value={String(sinceHours)}
								onValueChange={(v) => setSinceHours(Number(v))}
							>
								<SelectTrigger className="w-[160px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{SINCE_HOURS_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={String(opt.value)}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button onClick={() => refetch()} disabled={isFetching}>
								{isFetching ? (
									<Loader2 className="size-4 animate-spin mr-2" />
								) : (
									<RefreshCw className="size-4 mr-2" />
								)}
								{isFetched ? "Re-check" : "Check server health"}
							</Button>
							{health && !health.error && (
								<Button variant="outline" onClick={handleDownload}>
									<Download className="size-4 mr-2" />
									Download report
								</Button>
							)}
						</div>
					</div>

					{!isFetched && !isFetching && (
						<div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground border border-dashed rounded-xl">
							<ServerIcon className="size-8" />
							<span>
								Nothing checked yet — click "Check server health" above.
							</span>
						</div>
					)}

					{health?.error && (
						<div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-lg p-3">
							Couldn't read server health: {health.error}
						</div>
					)}

					{health && !health.error && (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							<Card className="p-4">
								<div className="flex items-center gap-2 text-sm font-medium mb-2">
									<ServerIcon className="size-4 text-muted-foreground" />
									Containers &amp; services
								</div>
								<div className="text-2xl font-semibold">
									{health.containers.containerCount}
								</div>
								<div className="text-xs text-muted-foreground">
									containers · {health.containers.serviceCount} swarm services
								</div>
							</Card>

							<Card className="p-4">
								<div className="flex items-center gap-2 text-sm font-medium mb-2">
									<Cpu className="size-4 text-muted-foreground" />
									Host resources
								</div>
								<div className="text-sm">
									Memory: {bytesToGb(health.resources.memUsedBytes)} /{" "}
									{bytesToGb(health.resources.memTotalBytes)} GB
								</div>
								<Progress value={memUsedPct} className="h-2 mt-1" />
								<div className="text-xs text-muted-foreground mt-2">
									{health.resources.cpuCount} CPU cores
								</div>
							</Card>

							<Card className="p-4">
								<div className="flex items-center gap-2 text-sm font-medium mb-2">
									<HardDrive className="size-4 text-muted-foreground" />
									Disk (/)
								</div>
								<div className="text-sm">
									{bytesToGb(health.disk.usedBytes)} /{" "}
									{bytesToGb(health.disk.totalBytes)} GB
								</div>
								<Progress value={diskUsedPct} className="h-2 mt-1" />
							</Card>

							<Card className="p-4">
								<div className="flex items-center justify-between gap-2 text-sm font-medium mb-2">
									<span className="flex items-center gap-2">
										<AlertTriangle className="size-4 text-muted-foreground" />
										Inotify
									</span>
									<Badge
										variant={health.inotify.persisted ? "default" : "secondary"}
									>
										{health.inotify.persisted ? "persisted" : "runtime only"}
									</Badge>
								</div>
								<div className="text-sm">
									max_user_instances: {health.inotify.currentInstances} /{" "}
									{health.inotify.maxInstances.toLocaleString()} (
									{inotifyUsedPct}%)
								</div>
								<Progress value={inotifyUsedPct} className="h-2 mt-1" />
								<div className="text-xs text-muted-foreground mt-2">
									max_user_watches: {health.inotify.maxWatches.toLocaleString()}{" "}
									· max_queued_events:{" "}
									{health.inotify.maxQueuedEvents.toLocaleString()}
								</div>
							</Card>

							<Card className="p-4">
								<div className="flex items-center gap-2 text-sm font-medium mb-2">
									<Network className="size-4 text-muted-foreground" />
									Docker networks
								</div>
								<div className="text-2xl font-semibold">
									{health.dockerNetworks.count}
								</div>
								<div className="text-xs text-muted-foreground">
									The default Docker address pool is exhausted around ~30
									networks unless <code>default-address-pools</code> is
									configured in <code>/etc/docker/daemon.json</code>.
									{health.dockerNetworks.addressPools
										? " Custom pool detected on this server."
										: ""}
								</div>
							</Card>

							{health.reservation && (
								<Card className="p-4">
									<div className="flex items-center gap-2 text-sm font-medium mb-2">
										<Cpu className="size-4 text-muted-foreground" />
										Memory/CPU reservation
									</div>
									<div className="text-sm">
										{bytesToGb(health.reservation.memoryReservedBytes)} GB
										reserved ·{" "}
										{nanoCpusToCores(health.reservation.cpuReservedNanoCpus)}{" "}
										CPUs reserved
									</div>
									<div className="text-xs text-muted-foreground mt-2">
										Across {health.reservation.appCount} Application services.
										{health.reservation.unsupportedComposeCount > 0
											? ` ${health.reservation.unsupportedComposeCount} Compose service(s) on this server aren't included — reservations aren't tracked per-service for Compose.`
											: ""}
									</div>
								</Card>
							)}
						</div>
					)}

					{health &&
						!health.error &&
						(health.dockerNetworks.usage.length > 0 ||
							health.dockerNetworks.usageError) && (
							<div className="flex flex-col gap-2">
								<h4 className="text-sm font-medium flex items-center gap-2">
									<Network className="size-4 text-muted-foreground" />
									Network IP usage
								</h4>
								<p className="text-xs text-muted-foreground">
									IPs assigned to containers vs. the subnet's usable capacity,
									per network — including reserved networks like{" "}
									<code>dokploy-network</code>. A network stuck near 100% blocks
									new containers from starting even when the host has plenty of
									other resources free.
								</p>
								{health.dockerNetworks.usageError ? (
									<div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-lg p-3">
										Couldn't read network IP usage:{" "}
										{health.dockerNetworks.usageError}
									</div>
								) : (
									<div className="rounded-lg border overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Network</TableHead>
													<TableHead>Driver</TableHead>
													<TableHead>Subnet</TableHead>
													<TableHead>IPs in use</TableHead>
													<TableHead>Usage</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{health.dockerNetworks.usage.map((n) => (
													<TableRow key={n.name}>
														<TableCell className="font-medium">
															{n.name}
														</TableCell>
														<TableCell className="text-muted-foreground">
															{n.driver}
														</TableCell>
														<TableCell className="text-muted-foreground">
															{n.subnet ?? "Auto"}
														</TableCell>
														<TableCell className="text-muted-foreground">
															{n.capacity !== null
																? `${n.containersInUse} / ${n.capacity}`
																: n.containersInUse}
														</TableCell>
														<TableCell>
															{n.percentUsed !== null ? (
																<Badge
																	variant={
																		n.percentUsed >= 90
																			? "red"
																			: n.percentUsed >= 70
																				? "yellow"
																				: "green"
																	}
																>
																	{n.percentUsed}%
																</Badge>
															) : (
																<span className="text-muted-foreground text-xs">
																	—
																</span>
															)}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}
							</div>
						)}

					{health && !health.error && (
						<div className="flex flex-col gap-2">
							<h4 className="text-sm font-medium">
								Docker daemon errors (
								{SINCE_HOURS_OPTIONS.find(
									(o) => o.value === sinceHours,
								)?.label.toLowerCase()}
								)
							</h4>
							<CodeEditor
								value={daemonErrorsText}
								language="shell"
								disabled
								lineWrapping
								wrapperClassName="h-64 rounded-lg border"
							/>
						</div>
					)}
				</div>
			</Card>

			<Card className="bg-sidebar p-2.5 rounded-xl w-full">
				<div className="rounded-xl bg-background shadow-md p-6 flex flex-col gap-4">
					<div className="flex items-center justify-between gap-4 flex-wrap">
						<div>
							<h3 className="text-lg font-medium">Failed deployments</h3>
							<p className="text-sm text-muted-foreground max-w-xl">
								Deployments that ended in error, with an automatic cause guess
								based on the same patterns used to triage failures manually.
							</p>
						</div>
						<div className="flex items-center gap-2 flex-wrap">
							<Select
								value={projectId ?? "all"}
								onValueChange={(v) => setProjectId(v === "all" ? undefined : v)}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue placeholder="All projects" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All projects</SelectItem>
									{projects?.map((project) => (
										<SelectItem
											key={project.projectId}
											value={project.projectId}
										>
											{project.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className="justify-start text-left font-normal"
									>
										<CalendarIcon className="mr-2 h-4 w-4" />
										{dateRange.from && dateRange.to
											? `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`
											: "Pick a date range"}
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0" align="end">
									<Calendar
										mode="range"
										defaultMonth={dateRange.from}
										selected={{ from: dateRange.from, to: dateRange.to }}
										onSelect={(range) => {
											setHasCustomRange(true);
											setDateRange({ from: range?.from, to: range?.to });
										}}
										numberOfMonths={2}
									/>
								</PopoverContent>
							</Popover>
							<Button onClick={handleCheckFailed} disabled={isFetchingFailed}>
								{isFetchingFailed ? (
									<Loader2 className="size-4 animate-spin mr-2" />
								) : (
									<RefreshCw className="size-4 mr-2" />
								)}
								{isFetchedFailed ? "Re-check" : "Check"}
							</Button>
						</div>
					</div>

					{!isFetchedFailed && !isFetchingFailed && (
						<div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-xl">
							Nothing checked yet.
						</div>
					)}

					{isFetchedFailed && (failedDeployments?.length ?? 0) === 0 && (
						<div className="text-sm text-muted-foreground py-4 text-center">
							No failed deployments in this range.
						</div>
					)}

					{(failedDeployments?.length ?? 0) > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead>Service</TableHead>
									<TableHead>Project</TableHead>
									<TableHead>Likely cause</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{failedDeployments?.map((deployment) => {
									const info = getServiceInfo(deployment);
									return (
										<TableRow key={deployment.deploymentId}>
											<TableCell className="whitespace-nowrap">
												{format(new Date(deployment.createdAt), "PPp")}
											</TableCell>
											<TableCell>
												{info ? (
													<Link
														href={info.href}
														className="text-primary hover:underline"
													>
														{info.name}
													</Link>
												) : (
													"—"
												)}
											</TableCell>
											<TableCell>
												{info ? (
													<Link
														href={`/dashboard/project/${info.projectId}`}
														className="text-muted-foreground hover:underline"
													>
														{info.projectName}
													</Link>
												) : (
													"—"
												)}
											</TableCell>
											<TableCell>
												<span className="flex items-center gap-1.5">
													{deployment.classification ? (
														<Badge variant="destructive">
															{deployment.classification.label}
														</Badge>
													) : (
														<span className="text-muted-foreground text-xs">
															Unclassified
														</span>
													)}
													{deployment.rawError && (
														<Tooltip>
															<TooltipTrigger>
																<Info className="size-3.5 text-muted-foreground" />
															</TooltipTrigger>
															<TooltipContent className="max-w-md whitespace-pre-wrap break-all font-mono text-xs">
																{deployment.rawError}
															</TooltipContent>
														</Tooltip>
													)}
												</span>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</div>
			</Card>
		</div>
	);
};
