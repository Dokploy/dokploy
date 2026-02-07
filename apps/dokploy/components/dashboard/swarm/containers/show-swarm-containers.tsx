import { useEffect, useState } from "react";
import {
	ChevronDown,
	ChevronRight,
	Cpu,
	HardDrive,
	Loader2,
	Network,
	RefreshCw,
	Server,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";

interface ContainerStat {
	BlockIO: string;
	CPUPerc: string;
	Container: string;
	ID: string;
	MemPerc: string;
	MemUsage: string;
	Name: string;
	NetIO: string;
}

interface ContainerInfo {
	Name: string;
	Image: string;
	Node: string;
	CurrentState: string;
	DesiredState: string;
	Ports: string;
	Error: string;
	ID: string;
}

interface NodeGroup {
	nodeName: string;
	containers: ContainerInfo[];
}

interface Props {
	serverId?: string;
}

export const ShowSwarmContainers = ({ serverId }: Props) => {
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

	// Use the same endpoints the Overview tab's "Services" dialog uses
	const {
		data: nodeApps,
		isLoading: appsLoading,
		isError: appsError,
		error: appsErrorDetail,
		refetch: refetchApps,
	} = api.swarm.getNodeApps.useQuery({ serverId });

	const applicationList =
		nodeApps && nodeApps.length > 0
			? nodeApps.map((app: { Name: string }) => app.Name)
			: [];

	const {
		data: appDetails,
		isLoading: detailsLoading,
		refetch: refetchDetails,
	} = api.swarm.getAppInfos.useQuery(
		{ appName: applicationList, serverId },
		{ enabled: applicationList.length > 0 },
	);

	const { data: stats, isLoading: statsLoading } =
		api.swarm.getContainerStats.useQuery(
			{ serverId },
			{ refetchInterval: 5000 },
		);

	const isLoading = appsLoading || (applicationList.length > 0 && detailsLoading);

	// Build container list by combining service info with task details
	const containers: ContainerInfo[] = [];
	if (nodeApps && appDetails) {
		for (const app of nodeApps) {
			const details =
				appDetails?.filter(
					(detail: { Name: string }) =>
						detail.Name.startsWith(`${app.Name}.`),
				) || [];

			if (details.length === 0) {
				containers.push({
					...app,
					CurrentState: "N/A",
					DesiredState: "N/A",
					Error: "",
					Node: "N/A",
					ID: app.ID,
				});
			} else {
				for (const detail of details) {
					containers.push({
						Name: detail.Name,
						Image: detail.Image || app.Image,
						CurrentState: detail.CurrentState,
						DesiredState: detail.DesiredState,
						Error: detail.Error,
						Node: detail.Node,
						Ports: detail.Ports || app.Ports,
						ID: detail.ID,
					});
				}
			}
		}
	}

	// Filter to only running tasks
	const runningContainers = containers.filter(
		(c) =>
			c.DesiredState === "Running" ||
			c.CurrentState.startsWith("Running") ||
			c.CurrentState === "N/A",
	);

	// Auto-expand all nodes on first data load
	useEffect(() => {
		if (runningContainers.length > 0 && expandedNodes.size === 0) {
			const nodeNames = new Set<string>();
			for (const c of runningContainers) {
				if (c.Node) {
					nodeNames.add(c.Node);
				}
			}
			setExpandedNodes(nodeNames);
		}
	}, [runningContainers.length]);

	if (isLoading) {
		return (
			<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[40vh]">
				<span>Loading containers...</span>
				<Loader2 className="animate-spin size-4" />
			</div>
		);
	}

	if (appsError) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[40vh] gap-2">
				<span className="text-destructive">
					Failed to load container data
				</span>
				<span className="text-sm text-muted-foreground max-w-md text-center">
					{appsErrorDetail?.message}
				</span>
				<Button
					variant="outline"
					size="sm"
					onClick={() => refetchApps()}
					className="mt-2"
				>
					<RefreshCw className="h-4 w-4 mr-2" />
					Retry
				</Button>
			</div>
		);
	}

	if (runningContainers.length === 0) {
		return (
			<div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
				<span>No running containers found</span>
			</div>
		);
	}

	// Group by node
	const nodeMap = new Map<string, ContainerInfo[]>();
	for (const c of runningContainers) {
		const nodeName = c.Node || "Unknown";
		if (!nodeMap.has(nodeName)) {
			nodeMap.set(nodeName, []);
		}
		nodeMap.get(nodeName)!.push(c);
	}

	const nodeGroups: NodeGroup[] = [];
	for (const [nodeName, nodeContainers] of nodeMap) {
		nodeGroups.push({ nodeName, containers: nodeContainers });
	}
	nodeGroups.sort((a, b) => a.nodeName.localeCompare(b.nodeName));

	// Build stats lookup
	const statsMap = new Map<string, ContainerStat>();
	if (stats) {
		for (const stat of stats) {
			statsMap.set(stat.Name, stat);
		}
	}

	const findStatsForContainer = (
		taskName: string,
	): ContainerStat | undefined => {
		// docker service ps Name: "myservice.1"
		// docker stats Name: "myservice.1.taskid"
		for (const [containerName, stat] of statsMap) {
			if (containerName.startsWith(`${taskName}.`)) {
				return stat;
			}
		}
		return undefined;
	};

	const toggleNode = (nodeName: string) => {
		setExpandedNodes((prev: Set<string>) => {
			const next = new Set(prev);
			if (next.has(nodeName)) {
				next.delete(nodeName);
			} else {
				next.add(nodeName);
			}
			return next;
		});
	};

	const handleRefresh = () => {
		refetchApps();
		refetchDetails();
	};

	return (
		<div className="flex flex-col gap-4">
			<header className="flex items-center flex-wrap gap-4 justify-between">
				<div className="space-y-1">
					<CardTitle className="text-xl flex flex-row gap-2">
						<Server className="size-6 text-muted-foreground self-center" />
						Container Breakdown by Node
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						View where containers are running across your swarm nodes
						{statsLoading ? "" : " (metrics refresh every 5s)"}
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={handleRefresh}>
					<RefreshCw className="h-4 w-4 mr-2" />
					Refresh
				</Button>
			</header>

			<div className="grid gap-4 md:grid-cols-2">
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Running Containers
						</CardTitle>
						<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
							<Cpu className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{runningContainers.length}
						</div>
					</CardContent>
				</Card>

				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Nodes with Containers
						</CardTitle>
						<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
							<Server className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{nodeGroups.length}</div>
					</CardContent>
				</Card>
			</div>

			<div className="flex flex-col gap-4">
				{nodeGroups.map((group) => (
					<NodeSection
						key={group.nodeName}
						group={group}
						isExpanded={expandedNodes.has(group.nodeName)}
						onToggleNode={toggleNode}
						findStatsForContainer={findStatsForContainer}
					/>
				))}
			</div>
		</div>
	);
};

interface NodeSectionProps {
	group: NodeGroup;
	isExpanded: boolean;
	onToggleNode: (nodeName: string) => void;
	findStatsForContainer: (taskName: string) => ContainerStat | undefined;
}

const NodeSection = ({
	group,
	isExpanded,
	onToggleNode,
	findStatsForContainer,
}: NodeSectionProps) => {
	const runningCount = group.containers.filter((c) =>
		c.CurrentState.startsWith("Running"),
	).length;

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={() => onToggleNode(group.nodeName)}
		>
			<Card className="bg-background">
				<CollapsibleTrigger asChild>
					<CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								{isExpanded ? (
									<ChevronDown className="h-4 w-4 text-muted-foreground" />
								) : (
									<ChevronRight className="h-4 w-4 text-muted-foreground" />
								)}
								<Server className="h-5 w-5 text-muted-foreground" />
								<CardTitle className="text-base">
									{group.nodeName}
								</CardTitle>
								<Badge variant="secondary">
									{group.containers.length} container
									{group.containers.length !== 1 ? "s" : ""}
								</Badge>
								{runningCount === group.containers.length ? (
									<Badge variant="default">All Running</Badge>
								) : (
									<Badge variant="orange">
										{runningCount}/{group.containers.length} Running
									</Badge>
								)}
							</div>
						</div>
					</CardHeader>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<CardContent className="pt-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[250px]">
										Container
									</TableHead>
									<TableHead>State</TableHead>
									<TableHead className="text-right">CPU</TableHead>
									<TableHead className="text-right">
										Memory
									</TableHead>
									<TableHead className="text-right">
										Block I/O
									</TableHead>
									<TableHead className="text-right">
										Network I/O
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{group.containers.map((container) => {
									const stat = findStatsForContainer(
										container.Name,
									);
									return (
										<ContainerRow
											key={container.ID}
											container={container}
											stat={stat}
										/>
									);
								})}
							</TableBody>
						</Table>
					</CardContent>
				</CollapsibleContent>
			</Card>
		</Collapsible>
	);
};

interface ContainerRowProps {
	container: ContainerInfo;
	stat: ContainerStat | undefined;
}

const ContainerRow = ({ container, stat }: ContainerRowProps) => {
	const isRunning = container.CurrentState.startsWith("Running");
	const cpuValue = stat
		? Number.parseFloat(stat.CPUPerc.replace("%", ""))
		: 0;
	const memValue = stat
		? Number.parseFloat(stat.MemPerc.replace("%", ""))
		: 0;

	return (
		<TableRow>
			<TableCell>
				<div className="flex flex-col gap-1">
					<span className="font-medium text-sm">{container.Name}</span>
					<span className="text-xs text-muted-foreground truncate max-w-[230px]">
						{container.Image}
					</span>
				</div>
			</TableCell>
			<TableCell>
				<Badge variant={isRunning ? "default" : "destructive"}>
					{container.CurrentState}
				</Badge>
			</TableCell>
			<TableCell className="text-right">
				{stat ? (
					<div className="flex flex-col items-end gap-1">
						<span className="text-sm font-medium">{stat.CPUPerc}</span>
						<Progress value={cpuValue} className="w-[80px] h-1.5" />
					</div>
				) : (
					<span className="text-xs text-muted-foreground">--</span>
				)}
			</TableCell>
			<TableCell className="text-right">
				{stat ? (
					<div className="flex flex-col items-end gap-1">
						<span className="text-sm font-medium">
							{stat.MemUsage}
						</span>
						<Progress value={memValue} className="w-[80px] h-1.5" />
					</div>
				) : (
					<span className="text-xs text-muted-foreground">--</span>
				)}
			</TableCell>
			<TableCell className="text-right">
				{stat ? (
					<div className="flex items-center justify-end gap-1.5">
						<HardDrive className="h-3 w-3 text-muted-foreground" />
						<span className="text-sm">{stat.BlockIO}</span>
					</div>
				) : (
					<span className="text-xs text-muted-foreground">--</span>
				)}
			</TableCell>
			<TableCell className="text-right">
				{stat ? (
					<div className="flex items-center justify-end gap-1.5">
						<Network className="h-3 w-3 text-muted-foreground" />
						<span className="text-sm">{stat.NetIO}</span>
					</div>
				) : (
					<span className="text-xs text-muted-foreground">--</span>
				)}
			</TableCell>
		</TableRow>
	);
};
