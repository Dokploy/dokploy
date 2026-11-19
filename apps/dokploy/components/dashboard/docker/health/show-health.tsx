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
import { useTranslation } from "react-i18next";
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
	{ labelKey: "docker.time.lastHour", value: 1 },
	{ labelKey: "docker.time.last6Hours", value: 6 },
	{ labelKey: "docker.time.last24Hours", value: 24 },
	{ labelKey: "docker.time.last7Days", value: 168 },
];

export const ShowHealth = ({ serverId }: Props) => {
	const { t } = useTranslation();
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
		? `${t("docker.health.logsFromTo", {
				from: new Date(
					health.daemonLogsWindow.fromEpoch * 1000,
				).toLocaleString(),
				to: new Date(health.daemonLogsWindow.toEpoch * 1000).toLocaleString(),
			})}`
		: null;
	const daemonErrorsText = [
		daemonLogsWindowText,
		health && health.daemonErrors.length > 0
			? health.daemonErrors.join("\n")
			: t("docker.health.noDaemonErrors"),
	]
		.filter(Boolean)
		.join("\n\n");

	const buildHealthReport = () => {
		if (!health) return "";
		const lines: string[] = [];
		lines.push(t("docker.health.reportTitle"));
		lines.push(
			t("docker.health.reportGenerated", {
				date: new Date(health.checkedAt).toLocaleString(),
			}),
		);
		lines.push(
			t("docker.health.reportWindow", {
				range:
					SINCE_HOURS_OPTIONS.find((o) => o.value === sinceHours)?.labelKey !=
					null
						? t(
								SINCE_HOURS_OPTIONS.find((o) => o.value === sinceHours)
									?.labelKey ?? "",
							)
						: `${sinceHours}h`,
			}),
		);
		lines.push("");

		lines.push(t("docker.health.reportContainersSection"));
		lines.push(
			t("docker.health.reportContainers", {
				amount: health.containers.containerCount,
			}),
		);
		lines.push(
			t("docker.health.reportServices", {
				amount: health.containers.serviceCount,
			}),
		);
		lines.push("");

		lines.push(t("docker.health.reportHostSection"));
		lines.push(
			t("docker.health.reportMemory", {
				used: bytesToGb(health.resources.memUsedBytes),
				total: bytesToGb(health.resources.memTotalBytes),
			}),
		);
		lines.push(
			t("docker.health.reportCpuCores", {
				amount: health.resources.cpuCount,
			}),
		);
		lines.push("");

		lines.push(t("docker.health.reportDiskSection"));
		lines.push(
			`${bytesToGb(health.disk.usedBytes)} / ${bytesToGb(health.disk.totalBytes)} GB`,
		);
		lines.push("");

		lines.push(t("docker.health.reportInotifySection"));
		lines.push(
			`max_user_instances: ${health.inotify.currentInstances} / ${health.inotify.maxInstances}`,
		);
		lines.push(`max_user_watches: ${health.inotify.maxWatches}`);
		lines.push(`max_queued_events: ${health.inotify.maxQueuedEvents}`);
		lines.push(
			t("docker.health.reportPersisted", {
				value: health.inotify.persisted
					? t("docker.health.yes")
					: t("docker.health.no"),
			}),
		);
		lines.push("");

		lines.push(t("docker.health.reportNetworksSection"));
		lines.push(
			t("docker.health.reportTotalNetworks", {
				amount: health.dockerNetworks.count,
			}),
		);
		if (health.dockerNetworks.addressPools) {
			lines.push(
				`default-address-pools: ${JSON.stringify(health.dockerNetworks.addressPools)}`,
			);
		}
		if (health.dockerNetworks.usageError) {
			lines.push(
				t("docker.health.reportUsageError", {
					error: health.dockerNetworks.usageError,
				}),
			);
		} else if (health.dockerNetworks.usage.length > 0) {
			lines.push("");
			lines.push(t("docker.health.reportTableHeader"));
			lines.push("|---|---|---|---|---|---|");
			for (const n of health.dockerNetworks.usage) {
				lines.push(
					`| ${n.name} | ${n.driver} | ${n.subnet ?? t("docker.health.auto")} | ${n.containersInUse} | ${n.capacity ?? "—"} | ${n.percentUsed ?? "—"}% |`,
				);
			}
		}
		lines.push("");

		if (health.reservation) {
			lines.push(t("docker.health.reportReservationSection"));
			lines.push(
				t("docker.health.reportReservedMemory", {
					amount: bytesToGb(health.reservation.memoryReservedBytes),
				}),
			);
			lines.push(
				t("docker.health.reportReservedCpu", {
					amount: nanoCpusToCores(health.reservation.cpuReservedNanoCpus),
				}),
			);
			lines.push(
				t("docker.health.reportAcrossApps", {
					amount: health.reservation.appCount,
				}),
			);
			if (health.reservation.unsupportedComposeCount > 0) {
				lines.push(
					t("docker.health.reportUnsupportedCompose", {
						amount: health.reservation.unsupportedComposeCount,
					}),
				);
			}
			lines.push("");
		}

		lines.push(t("docker.health.reportDaemonErrorsSection"));
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
							<h3 className="text-lg font-medium">
								{t("docker.health.title")}
							</h3>
							<p className="text-sm text-muted-foreground max-w-xl">
								{t("docker.health.description")}
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
											{t(opt.labelKey)}
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
								{isFetched
									? t("docker.health.recheck")
									: t("docker.health.checkHealth")}
							</Button>
							{health && !health.error && (
								<Button variant="outline" onClick={handleDownload}>
									<Download className="size-4 mr-2" />
									{t("docker.health.downloadReport")}
								</Button>
							)}
						</div>
					</div>

					{isFetching && !health && (
						<div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground border border-dashed rounded-xl">
							<Loader2 className="size-8 animate-spin" />
							<span>{t("docker.health.checking")}</span>
						</div>
					)}

					{health?.error && (
						<div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-lg p-3">
							{t("docker.health.error", { error: health.error })}
						</div>
					)}

					{health && !health.error && (
						<div
							className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${isFetching ? "opacity-50" : ""}`}
						>
							<Card className="p-4">
								<div className="flex items-center gap-2 text-sm font-medium mb-2">
									<ServerIcon className="size-4 text-muted-foreground" />
									{t("docker.health.containersServices")}
								</div>
								<div className="text-2xl font-semibold">
									{health.containers.containerCount}
								</div>
								<div className="text-xs text-muted-foreground">
									{t("docker.health.containersSubtitle", {
										amount: health.containers.serviceCount,
									})}
								</div>
							</Card>

							<Card className="p-4">
								<div className="flex items-center gap-2 text-sm font-medium mb-2">
									<Cpu className="size-4 text-muted-foreground" />
									{t("docker.health.hostResources")}
								</div>
								<div className="text-sm">
									{t("docker.health.memory", {
										used: bytesToGb(health.resources.memUsedBytes),
										total: bytesToGb(health.resources.memTotalBytes),
									})}
								</div>
								<Progress value={memUsedPct} className="h-2 mt-1" />
								<div className="text-xs text-muted-foreground mt-2">
									{t("docker.health.cpuCores", {
										amount: health.resources.cpuCount,
									})}
								</div>
							</Card>

							<Card className="p-4">
								<div className="flex items-center gap-2 text-sm font-medium mb-2">
									<HardDrive className="size-4 text-muted-foreground" />
									{t("docker.health.diskRoot")}
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
										{t("docker.health.inotify")}
									</span>
									<Badge
										variant={health.inotify.persisted ? "default" : "secondary"}
									>
										{health.inotify.persisted
											? t("docker.health.persisted")
											: t("docker.health.runtimeOnly")}
									</Badge>
								</div>
								<div className="text-sm">
									{t("docker.health.maxUserInstances", {
										value: health.inotify.currentInstances,
										total: health.inotify.maxInstances.toLocaleString(),
										percent: inotifyUsedPct,
									})}
								</div>
								<Progress value={inotifyUsedPct} className="h-2 mt-1" />
								<div className="text-xs text-muted-foreground mt-2">
									{t("docker.health.maxUserWatches", {
										watches: health.inotify.maxWatches.toLocaleString(),
										events: health.inotify.maxQueuedEvents.toLocaleString(),
									})}
								</div>
							</Card>

							<Card className="p-4">
								<div className="flex items-center gap-2 text-sm font-medium mb-2">
									<Network className="size-4 text-muted-foreground" />
									{t("docker.health.dockerNetworks")}
								</div>
								<div className="text-2xl font-semibold">
									{health.dockerNetworks.count}
								</div>
								<div className="text-xs text-muted-foreground">
									{t("docker.health.networksHint")}
									{health.dockerNetworks.addressPools
										? ` ${t("docker.health.customPool")}`
										: ""}
								</div>
							</Card>

							{health.reservation && (
								<Card className="p-4">
									<div className="flex items-center gap-2 text-sm font-medium mb-2">
										<Cpu className="size-4 text-muted-foreground" />
										{t("docker.health.reservation")}
									</div>
									<div className="text-sm">
										{t("docker.health.reservationSummary", {
											memory: bytesToGb(health.reservation.memoryReservedBytes),
											cpu: nanoCpusToCores(
												health.reservation.cpuReservedNanoCpus,
											),
										})}
									</div>
									<div className="text-xs text-muted-foreground mt-2">
										{t("docker.health.reservationApps", {
											amount: health.reservation.appCount,
										})}
										{health.reservation.unsupportedComposeCount > 0
											? ` ${t("docker.health.reservationCompose", {
													amount: health.reservation.unsupportedComposeCount,
												})}`
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
									{t("docker.health.networkIpUsage")}
								</h4>
								<p className="text-xs text-muted-foreground">
									{t("docker.health.ipUsageDescription")}
								</p>
								{health.dockerNetworks.usageError ? (
									<div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-lg p-3">
										{t("docker.health.ipUsageError", {
											error: health.dockerNetworks.usageError,
										})}
									</div>
								) : (
									<div className="rounded-lg border overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>
														{t("docker.health.tableNetwork")}
													</TableHead>
													<TableHead>
														{t("docker.health.tableDriver")}
													</TableHead>
													<TableHead>
														{t("docker.health.tableSubnet")}
													</TableHead>
													<TableHead>
														{t("docker.health.tableIpsInUse")}
													</TableHead>
													<TableHead>{t("docker.health.tableUsage")}</TableHead>
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
															{n.subnet ?? t("docker.health.auto")}
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
								{t("docker.health.daemonErrorsTitle", {
									range: t(
										SINCE_HOURS_OPTIONS.find((o) => o.value === sinceHours)
											?.labelKey ?? "",
									).toLowerCase(),
								})}
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
