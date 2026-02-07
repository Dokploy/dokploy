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

interface ServiceTask {
	ID: string;
	Name: string;
	Image: string;
	Node: string;
	DesiredState: string;
	CurrentState: string;
	Error: string;
	Ports: string;
}

interface NodeGroup {
	nodeName: string;
	tasks: ServiceTask[];
}

interface Props {
	serverId?: string;
}

export const ShowSwarmContainers = ({ serverId }: Props) => {
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

	const {
		data: tasks,
		isLoading: tasksLoading,
		isError: tasksError,
		error: tasksErrorDetail,
		refetch: refetchTasks,
	} = api.swarm.getServiceTasks.useQuery(
		{ serverId },
		{ refetchInterval: 15000 },
	);

	const { data: stats, isLoading: statsLoading } =
		api.swarm.getContainerStats.useQuery(
			{ serverId },
			{ refetchInterval: 5000 },
		);

	// Auto-expand all nodes on first data load
	useEffect(() => {
		if (tasks && tasks.length > 0 && expandedNodes.size === 0) {
			const nodeNames = new Set<string>();
			for (const task of tasks) {
				if (task.Node) {
					nodeNames.add(task.Node);
				}
			}
			setExpandedNodes(nodeNames);
		}
	}, [tasks]);

	if (tasksLoading) {
		return (
			<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[40vh]">
				<span>Loading service tasks...</span>
				<Loader2 className="animate-spin size-4" />
			</div>
		);
	}

	if (tasksError) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[40vh] gap-2">
				<span className="text-destructive">
					Failed to load service tasks
				</span>
				<span className="text-sm text-muted-foreground max-w-md text-center">
					{tasksErrorDetail?.message}
				</span>
				<Button
					variant="outline"
					size="sm"
					onClick={() => refetchTasks()}
					className="mt-2"
				>
					<RefreshCw className="h-4 w-4 mr-2" />
					Retry
				</Button>
			</div>
		);
	}

	if (!tasks || tasks.length === 0) {
		return (
			<div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">
				<span>No running service tasks found</span>
			</div>
		);
	}

	// Group tasks by node
	const nodeGroups: NodeGroup[] = [];
	const nodeMap = new Map<string, ServiceTask[]>();

	for (const task of tasks) {
		const nodeName = task.Node || "Unknown";
		if (!nodeMap.has(nodeName)) {
			nodeMap.set(nodeName, []);
		}
		nodeMap.get(nodeName)!.push(task);
	}

	for (const [nodeName, nodeTasks] of nodeMap) {
		nodeGroups.push({ nodeName, tasks: nodeTasks });
	}

	nodeGroups.sort((a, b) => a.nodeName.localeCompare(b.nodeName));

	// Build a map of container stats by name prefix for matching
	const statsMap = new Map<string, ContainerStat>();
	if (stats) {
		for (const stat of stats) {
			statsMap.set(stat.Name, stat);
		}
	}

	const findStatsForTask = (taskName: string): ContainerStat | undefined => {
		// docker service ps gives Name like "myservice.1"
		// docker stats gives Name like "myservice.1.taskid"
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

	const totalTasks = tasks.length;
	const totalNodes = nodeGroups.length;

	return (
		<div className="flex flex-col gap-4">
			<header className="flex items-center flex-wrap gap-4 justify-between">
				<div className="space-y-1">
					<CardTitle className="text-xl flex flex-row gap-2">
						<Server className="size-6 text-muted-foreground self-center" />
						Container Breakdown by Node
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						View where service containers are running across your swarm nodes
						{statsLoading ? "" : " (metrics refresh every 5s)"}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => refetchTasks()}
				>
					<RefreshCw className="h-4 w-4 mr-2" />
					Refresh
				</Button>
			</header>

			<div className="grid gap-4 md:grid-cols-2">
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total Running Tasks
						</CardTitle>
						<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
							<Cpu className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{totalTasks}</div>
					</CardContent>
				</Card>

				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Nodes with Tasks
						</CardTitle>
						<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
							<Server className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{totalNodes}</div>
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
						findStatsForTask={findStatsForTask}
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
	findStatsForTask: (taskName: string) => ContainerStat | undefined;
}

const NodeSection = ({
	group,
	isExpanded,
	onToggleNode,
	findStatsForTask,
}: NodeSectionProps) => {
	const runningCount = group.tasks.filter((t) =>
		t.CurrentState.startsWith("Running"),
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
								<CardTitle className="text-base">{group.nodeName}</CardTitle>
								<Badge variant="secondary">
									{group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""}
								</Badge>
								{runningCount === group.tasks.length ? (
									<Badge variant="default">All Running</Badge>
								) : (
									<Badge variant="orange">
										{runningCount}/{group.tasks.length} Running
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
									<TableHead className="w-[250px]">Service</TableHead>
									<TableHead>State</TableHead>
									<TableHead className="text-right">CPU</TableHead>
									<TableHead className="text-right">Memory</TableHead>
									<TableHead className="text-right">Block I/O</TableHead>
									<TableHead className="text-right">Network I/O</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{group.tasks.map((task) => {
									const stat = findStatsForTask(task.Name);
									return (
										<ContainerRow
											key={task.ID}
											task={task}
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
	task: ServiceTask;
	stat: ContainerStat | undefined;
}

const ContainerRow = ({ task, stat }: ContainerRowProps) => {
	const isRunning = task.CurrentState.startsWith("Running");
	const cpuValue = stat ? Number.parseFloat(stat.CPUPerc.replace("%", "")) : 0;
	const memValue = stat ? Number.parseFloat(stat.MemPerc.replace("%", "")) : 0;

	return (
		<TableRow>
			<TableCell>
				<div className="flex flex-col gap-1">
					<span className="font-medium text-sm">{task.Name}</span>
					<span className="text-xs text-muted-foreground truncate max-w-[230px]">
						{task.Image}
					</span>
				</div>
			</TableCell>
			<TableCell>
				<Badge variant={isRunning ? "default" : "destructive"}>
					{task.CurrentState}
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
						<span className="text-sm font-medium">{stat.MemUsage}</span>
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
