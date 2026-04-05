import {
	AlertTriangle,
	Container,
	Info,
	Loader2,
	RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import {
	NoRunningContainers,
	NoServices,
	ServicesError,
	SwarmNotAvailable,
} from "./empty-states";
import { NodeSection } from "./node-section";
import { SummaryCards } from "./summary-cards";
import type { ContainerInfo, ContainerStat, SwarmNode } from "./types";

interface Props {
	serverId?: string;
}

export const ShowSwarmContainers = ({ serverId }: Props) => {
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

	const {
		data: nodes,
		isLoading: nodesLoading,
		isError: nodesError,
		error: nodesErrorDetail,
		refetch: refetchNodes,
	} = api.swarm.getNodes.useQuery({ serverId });

	const {
		data: nodeApps,
		isLoading: appsLoading,
		isError: appsError,
		error: appsErrorDetail,
		refetch: refetchApps,
	} = api.swarm.getNodeApps.useQuery(
		{ serverId },
		{ enabled: !nodesError && nodes !== undefined },
	);

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
			{
				refetchInterval: 5000,
				enabled: applicationList.length > 0 && !nodesError && !appsError,
			},
		);

	const isLoading =
		nodesLoading ||
		appsLoading ||
		(applicationList.length > 0 && detailsLoading);

	// Build container list
	const containers: ContainerInfo[] = [];
	if (nodeApps && appDetails) {
		for (const app of nodeApps) {
			const details =
				appDetails?.filter((detail: { Name: string }) =>
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

	const runningContainers = containers.filter(
		(c) =>
			c.Node !== "N/A" &&
			(c.DesiredState === "Running" || c.CurrentState.startsWith("Running")),
	);

	const unscheduledServices = containers.filter((c) => c.Node === "N/A");

	const downNodes = (nodes ?? []).filter(
		(n: SwarmNode) => n.Status !== "Ready" || n.Availability !== "Active",
	);

	const isMultiNode = (nodes?.length ?? 0) > 1;

	const nodeStatusMap = new Map<string, SwarmNode>();
	if (nodes) {
		for (const node of nodes) {
			nodeStatusMap.set(node.Hostname, node);
		}
	}

	const statsMap = new Map<string, ContainerStat>();
	if (stats) {
		for (const stat of stats) {
			statsMap.set(stat.Name, stat);
		}
	}

	const findStatsForContainer = (
		taskName: string,
	): ContainerStat | undefined => {
		for (const [containerName, stat] of statsMap) {
			if (containerName.startsWith(`${taskName}.`)) {
				return stat;
			}
		}
		return undefined;
	};

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

	// Build node groups
	const nodeMap = new Map<string, ContainerInfo[]>();
	for (const c of runningContainers) {
		const nodeName = c.Node || "Unknown";
		if (!nodeMap.has(nodeName)) {
			nodeMap.set(nodeName, []);
		}
		nodeMap.get(nodeName)!.push(c);
	}

	const nodeGroups = [];
	for (const [nodeName, nodeContainers] of nodeMap) {
		nodeGroups.push({
			nodeName,
			containers: nodeContainers,
			nodeStatus: nodeStatusMap.get(nodeName),
		});
	}
	nodeGroups.sort((a, b) => a.nodeName.localeCompare(b.nodeName));

	if (isLoading) {
		return (
			<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[40vh]">
				<span>Loading containers...</span>
				<Loader2 className="animate-spin size-4" />
			</div>
		);
	}

	if (nodesError) {
		return (
			<SwarmNotAvailable
				errorMessage={nodesErrorDetail?.message}
				onRetry={() => refetchNodes()}
			/>
		);
	}

	if (!nodesError && nodes === undefined) {
		return (
			<SwarmNotAvailable
				errorMessage="Docker Swarm may not be initialized — docker node ls returned no data."
				onRetry={() => refetchNodes()}
			/>
		);
	}

	const isRealAppsError =
		appsError && !appsErrorDetail?.message?.includes("data is undefined");
	if (isRealAppsError) {
		return (
			<ServicesError
				errorMessage={appsErrorDetail?.message}
				onRetry={() => refetchApps()}
			/>
		);
	}

	if (!nodeApps || nodeApps.length === 0) {
		return (
			<NoServices
				nodeCount={nodes?.length ?? 0}
				onRefresh={() => refetchApps()}
			/>
		);
	}

	if (runningContainers.length === 0) {
		return (
			<NoRunningContainers
				serviceCount={nodeApps.length}
				containers={containers}
				onRefresh={handleRefresh}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<header className="flex items-center flex-wrap gap-4 justify-between">
				<div className="space-y-1">
					<CardTitle className="text-xl flex flex-row gap-2">
						<Container className="size-6 text-muted-foreground self-center" />
						Container Breakdown by Node
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						Showing containers across {nodes?.length ?? 0} swarm node(s)
						{statsLoading ? "" : " (metrics refresh every 5s)"}
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={handleRefresh}>
					<RefreshCw className="h-4 w-4 mr-2" />
					Refresh
				</Button>
			</header>

			<SummaryCards
				nodeCount={nodes?.length ?? 0}
				downNodeCount={downNodes.length}
				serviceCount={nodeApps?.length ?? 0}
				unscheduledCount={unscheduledServices.length}
				runningContainerCount={runningContainers.length}
			/>

			{downNodes.length > 0 && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertTitle>{downNodes.length} Node(s) Unavailable</AlertTitle>
					<AlertDescription>
						<p className="mb-2">
							The following nodes are not ready or have been drained. Containers
							scheduled on these nodes may not be running.
						</p>
						<ul className="list-disc list-inside space-y-1 text-xs">
							{downNodes.map((node: SwarmNode) => (
								<li key={node.ID}>
									<strong>{node.Hostname}</strong> &mdash; Status: {node.Status}
									, Availability: {node.Availability}
									{node.ManagerStatus && ` (${node.ManagerStatus})`}
								</li>
							))}
						</ul>
						<p className="mt-2 text-xs">
							Manage nodes in{" "}
							<Link
								href="/dashboard/settings/cluster"
								className="underline underline-offset-4"
							>
								Cluster Settings
							</Link>
						</p>
					</AlertDescription>
				</Alert>
			)}

			{isMultiNode && (
				<Alert>
					<Info className="h-4 w-4" />
					<AlertTitle>Multi-Node Metrics Note</AlertTitle>
					<AlertDescription>
						CPU, memory, and I/O metrics are collected from the manager node via{" "}
						<code className="bg-muted px-1 py-0.5 rounded text-xs">
							docker stats
						</code>
						. Containers running on worker nodes will show &ldquo;--&rdquo; for
						metrics.
					</AlertDescription>
				</Alert>
			)}

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

			{unscheduledServices.length > 0 && (
				<Alert>
					<Info className="h-4 w-4" />
					<AlertTitle>
						{unscheduledServices.length} Service(s) With No Running Tasks
					</AlertTitle>
					<AlertDescription>
						<p className="mb-2">
							These services exist in the swarm but have no running containers.
							They may be scaled to 0 replicas or failing to start.
						</p>
						<ul className="list-disc list-inside space-y-1 text-xs">
							{unscheduledServices.map((svc) => (
								<li key={svc.ID}>
									<strong>{svc.Name}</strong>
									{svc.Error && svc.Error.trim() !== "" && (
										<span className="text-destructive ml-1">
											&mdash; {svc.Error}
										</span>
									)}
								</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
};
