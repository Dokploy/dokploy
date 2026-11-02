import {
	AlertTriangle,
	Cpu,
	Download,
	HardDrive,
	Loader2,
	Network,
	RefreshCw,
	Server as ServerIcon,
} from "lucide-react";
import { useState } from "react";
import { CodeEditor } from "@/components/shared/code-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export const ShowHealth = ({ serverId }: Props) => {
	const [sinceHours, setSinceHours] = useState(24);
	const {
		data: health,
		isFetching,
		refetch,
		isFetched,
	} = api.docker.getServerHealth.useQuery(
		{ serverId, sinceHours },
		{ refetchOnMount: false, refetchOnWindowFocus: false },
	);

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
								network pool, daemon errors). Runs automatically when you open
								this tab — click Re-check to refresh.
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

					{isFetching && !health && (
						<div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground border border-dashed rounded-xl">
							<Loader2 className="size-8 animate-spin" />
							<span>Checking server health…</span>
						</div>
					)}

					{health?.error && (
						<div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-lg p-3">
							Couldn't read server health: {health.error}
						</div>
					)}

					{health && !health.error && (
						<div
							className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${isFetching ? "opacity-50" : ""}`}
						>
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
		</div>
	);
};
