import {
	Activity,
	ArrowDownUp,
	ChevronDown,
	ChevronRight,
	HardDrive,
	Loader2,
	MemoryStick,
	Network,
	RefreshCw,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type RouterOutputs } from "@/utils/api";
import {
	type ContainerResourceSort,
	type ContainerResourceStat,
	formatDockerStatSize,
	getContainerResourceValues,
	sortContainerStats,
} from "./utils";

const SORT_LABELS: Record<ContainerResourceSort, string> = {
	block: "Disk I/O",
	cpu: "CPU",
	memory: "Memory",
	network: "Network",
	size: "Disk Size",
};

const getPressureBadge = (value: number) => {
	if (value >= 90) return "destructive";
	if (value >= 70) return "orange";
	if (value >= 40) return "yellow";
	return "secondary";
};

const getTopContainer = (
	stats: ContainerResourceStat[],
	sortBy: ContainerResourceSort,
) => {
	const [topContainer] = sortContainerStats(stats, sortBy);
	return topContainer;
};

type ContainerProcess =
	RouterOutputs["server"]["getContainerProcesses"][number];

const ContainerProcesses = ({ containerId }: { containerId: string }) => {
	const { data, error, isLoading } = api.server.getContainerProcesses.useQuery(
		{ containerId },
		{
			enabled: Boolean(containerId),
			refetchInterval: 5000,
			refetchOnWindowFocus: false,
		},
	);

	const processes = (data ?? []) as ContainerProcess[];

	return (
		<div className="p-3">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="text-sm font-medium">Processes</p>
					<p className="text-xs text-muted-foreground">
						Top 20 by CPU; refreshes every 5 seconds.
					</p>
				</div>
			</div>

			{isLoading ? (
				<div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					Loading processes...
				</div>
			) : error ? (
				<div className="rounded-md border border-destructive/40 p-3">
					<p className="text-sm font-medium text-destructive">
						Error loading processes
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{error instanceof Error
							? error.message
							: "Unable to read container processes."}
					</p>
				</div>
			) : processes.length === 0 ? (
				<p className="rounded-md border p-3 text-sm text-muted-foreground">
					No processes reported by Docker top.
				</p>
			) : (
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>PID</TableHead>
								<TableHead className="text-right">CPU</TableHead>
								<TableHead className="text-right">Memory</TableHead>
								<TableHead className="text-right">RSS</TableHead>
								<TableHead>Command</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{processes.map((process) => (
								<TableRow key={`${process.pid}-${process.command}`}>
									<TableCell className="font-mono text-xs">
										{process.pid}
									</TableCell>
									<TableCell className="text-right">
										<Badge variant={getPressureBadge(process.cpuPercent)}>
											{process.cpuPercent.toFixed(1)}%
										</Badge>
									</TableCell>
									<TableCell className="text-right">
										<Badge variant={getPressureBadge(process.memoryPercent)}>
											{process.memoryPercent.toFixed(1)}%
										</Badge>
									</TableCell>
									<TableCell className="text-right">
										{formatDockerStatSize(process.rssBytes)}
									</TableCell>
									<TableCell>
										<span className="block max-w-[520px] truncate font-mono text-xs">
											{process.command}
										</span>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
};

export const ContainerResourceUsage = () => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [expandedContainerId, setExpandedContainerId] = useState<string | null>(
		null,
	);
	const [sortBy, setSortBy] = useState<ContainerResourceSort>("cpu");

	const { data, error, isLoading, isRefetching, refetch } =
		api.server.getContainerResourceStats.useQuery(undefined, {
			enabled: isExpanded,
			refetchInterval: isExpanded ? 5000 : undefined,
			refetchOnWindowFocus: false,
		});

	const stats = (data ?? []) as ContainerResourceStat[];
	const sortedStats = useMemo(
		() => sortContainerStats(stats, sortBy).slice(0, 12),
		[sortBy, stats],
	);

	const topCpuContainer = getTopContainer(stats, "cpu");
	const topMemoryContainer = getTopContainer(stats, "memory");
	const topSizeContainer = getTopContainer(stats, "size");
	const topBlockContainer = getTopContainer(stats, "block");
	const topNetworkContainer = getTopContainer(stats, "network");

	const topCpuValues = topCpuContainer
		? getContainerResourceValues(topCpuContainer)
		: undefined;
	const topMemoryValues = topMemoryContainer
		? getContainerResourceValues(topMemoryContainer)
		: undefined;
	const topSizeValues = topSizeContainer
		? getContainerResourceValues(topSizeContainer)
		: undefined;
	const topBlockValues = topBlockContainer
		? getContainerResourceValues(topBlockContainer)
		: undefined;
	const topNetworkValues = topNetworkContainer
		? getContainerResourceValues(topNetworkContainer)
		: undefined;

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
				<div className="space-y-1">
					<CardTitle className="text-sm font-medium flex items-center gap-2">
						<Activity className="size-4 text-muted-foreground" />
						Resource Usage
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Find which running containers are using CPU, memory, disk I/O, and
						network right now.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{isExpanded && (
						<Button
							variant="ghost"
							size="icon"
							className="size-8"
							onClick={() => refetch()}
							disabled={isRefetching}
						>
							<RefreshCw
								className={`size-4 ${isRefetching ? "animate-spin" : ""}`}
							/>
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={() => setIsExpanded((value) => !value)}
					>
						<ArrowDownUp className="size-4 mr-2" />
						{isExpanded ? "Hide breakdown" : "View breakdown"}
					</Button>
				</div>
			</CardHeader>

			{isExpanded && (
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<Tabs
							value={sortBy}
							onValueChange={(value) =>
								setSortBy(value as ContainerResourceSort)
							}
						>
							<TabsList>
								<TabsTrigger value="cpu">CPU</TabsTrigger>
								<TabsTrigger value="memory">Memory</TabsTrigger>
								<TabsTrigger value="size">Disk Size</TabsTrigger>
								<TabsTrigger value="block">Disk I/O</TabsTrigger>
								<TabsTrigger value="network">Network</TabsTrigger>
							</TabsList>
						</Tabs>
						<p className="text-xs text-muted-foreground">
							Sorted by {SORT_LABELS[sortBy]}; refreshes every 5 seconds.
						</p>
					</div>

					{topCpuContainer &&
						topCpuValues &&
						topMemoryContainer &&
						topMemoryValues &&
						topSizeContainer &&
						topSizeValues &&
						topBlockContainer &&
						topBlockValues &&
						topNetworkContainer &&
						topNetworkValues && (
							<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
								<div className="rounded-md border p-3">
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<Activity className="size-3.5" />
										Top CPU
									</div>
									<p className="mt-1 text-sm font-medium">
										{topCpuContainer.Name}
									</p>
									<p className="text-xs text-muted-foreground">
										{topCpuValues.cpuPercent.toFixed(1)}%
									</p>
								</div>
								<div className="rounded-md border p-3">
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<MemoryStick className="size-3.5" />
										Memory Used
									</div>
									<p className="mt-1 text-sm font-medium">
										{formatDockerStatSize(topMemoryValues.memoryUsedBytes)}
									</p>
									<p className="text-xs text-muted-foreground">
										{topMemoryContainer.Name} - {topMemoryContainer.MemUsage}
									</p>
								</div>
								<div className="rounded-md border p-3">
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<HardDrive className="size-3.5" />
										Disk Size
									</div>
									<p className="mt-1 text-sm font-medium">
										{formatDockerStatSize(topSizeValues.diskSizeBytes)}
									</p>
									<p className="text-xs text-muted-foreground">
										{topSizeContainer.Name} - {topSizeContainer.Size || "--"}
									</p>
								</div>
								<div className="rounded-md border p-3">
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<HardDrive className="size-3.5" />
										Disk I/O
									</div>
									<p className="mt-1 text-sm font-medium">
										{formatDockerStatSize(topBlockValues.blockTotalBytes)}
									</p>
									<p className="text-xs text-muted-foreground">
										{topBlockContainer.Name} - {topBlockContainer.BlockIO}
									</p>
								</div>
								<div className="rounded-md border p-3">
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<Network className="size-3.5" />
										Network I/O
									</div>
									<p className="mt-1 text-sm font-medium">
										{formatDockerStatSize(topNetworkValues.networkTotalBytes)}
									</p>
									<p className="text-xs text-muted-foreground">
										{topNetworkContainer.Name} - {topNetworkContainer.NetIO}
									</p>
								</div>
							</div>
						)}

					{isLoading ? (
						<div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							Loading container usage...
						</div>
					) : error ? (
						<div className="rounded-md border border-destructive/40 p-4">
							<p className="text-sm font-medium text-destructive">
								Error loading container usage
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								{error instanceof Error
									? error.message
									: "Unable to read Docker stats."}
							</p>
						</div>
					) : sortedStats.length === 0 ? (
						<p className="rounded-md border p-4 text-sm text-muted-foreground">
							No running containers reported by Docker stats.
						</p>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-10" />
										<TableHead>Container</TableHead>
										<TableHead className="text-right">CPU</TableHead>
										<TableHead className="text-right">Memory</TableHead>
										<TableHead className="text-right">Disk Size</TableHead>
										<TableHead className="text-right">Disk I/O</TableHead>
										<TableHead className="text-right">Network I/O</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedStats.map((stat) => {
										const values = getContainerResourceValues(stat);
										const isContainerExpanded = expandedContainerId === stat.ID;

										return (
											<Fragment key={`${stat.ID}-${stat.Name}`}>
												<TableRow>
													<TableCell>
														<Button
															variant="ghost"
															size="icon"
															className="size-7"
															aria-label={
																isContainerExpanded
																	? `Hide processes for ${stat.Name}`
																	: `Show processes for ${stat.Name}`
															}
															onClick={() =>
																setExpandedContainerId((value) =>
																	value === stat.ID ? null : stat.ID,
																)
															}
														>
															{isContainerExpanded ? (
																<ChevronDown className="size-4" />
															) : (
																<ChevronRight className="size-4" />
															)}
														</Button>
													</TableCell>
													<TableCell>
														<div className="flex flex-col gap-1">
															<span className="font-medium">{stat.Name}</span>
															<span className="max-w-[260px] truncate text-xs text-muted-foreground">
																{stat.ID}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<Badge
															variant={getPressureBadge(values.cpuPercent)}
														>
															{values.cpuPercent.toFixed(1)}%
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														<div className="flex flex-col items-end gap-1">
															<Badge
																variant={getPressureBadge(values.memoryPercent)}
															>
																{values.memoryPercent.toFixed(1)}%
															</Badge>
															<span className="text-xs text-muted-foreground">
																{stat.MemUsage}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<div className="flex flex-col items-end">
															<span className="text-sm font-medium">
																{formatDockerStatSize(values.diskSizeBytes)}
															</span>
															<span className="text-xs text-muted-foreground">
																{stat.Size || "--"}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<div className="flex flex-col items-end">
															<span className="text-sm font-medium">
																{formatDockerStatSize(values.blockTotalBytes)}
															</span>
															<span className="text-xs text-muted-foreground">
																{stat.BlockIO}
															</span>
														</div>
													</TableCell>
													<TableCell className="text-right">
														<div className="flex flex-col items-end">
															<span className="text-sm font-medium">
																{formatDockerStatSize(values.networkTotalBytes)}
															</span>
															<span className="text-xs text-muted-foreground">
																{stat.NetIO}
															</span>
														</div>
													</TableCell>
												</TableRow>
												{isContainerExpanded && (
													<TableRow>
														<TableCell colSpan={7} className="bg-muted/20 p-0">
															<ContainerProcesses containerId={stat.ID} />
														</TableCell>
													</TableRow>
												)}
											</Fragment>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			)}
		</Card>
	);
};
