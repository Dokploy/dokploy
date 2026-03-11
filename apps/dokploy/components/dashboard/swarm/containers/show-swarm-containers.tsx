import { useEffect, useState } from "react";
import Link from "next/link";
import {
	AlertCircle,
	AlertTriangle,
	Container,
	Cpu,
	ExternalLink,
	Info,
	Loader2,
	RefreshCw,
	Server,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/utils/api";
import { NodeSection } from "./node-section";
import type { ContainerInfo, ContainerStat, SwarmNode } from "./types";

interface Props {
	serverId?: string;
}

export const ShowSwarmContainers = ({ serverId }: Props) => {
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

	// 1. Check if swarm is functioning by fetching nodes
	const {
		data: nodes,
		isLoading: nodesLoading,
		isError: nodesError,
		error: nodesErrorDetail,
		refetch: refetchNodes,
	} = api.swarm.getNodes.useQuery({ serverId });

	// 2. Fetch services (same endpoint the Overview tab uses)
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

	// 3. Fetch task details for each service
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

	// 4. Fetch container stats for metrics
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

	// Separate running containers from unscheduled services (no tasks / scaled to 0)
	const runningContainers = containers.filter(
		(c) =>
			c.Node !== "N/A" &&
			(c.DesiredState === "Running" || c.CurrentState.startsWith("Running")),
	);

	const unscheduledServices = containers.filter((c) => c.Node === "N/A");

	// Detect down or unavailable nodes
	const downNodes = (nodes ?? []).filter(
		(n: SwarmNode) => n.Status !== "Ready" || n.Availability !== "Active",
	);

	// Detect if this is a multi-node swarm (metrics only available on manager)
	const isMultiNode = (nodes?.length ?? 0) > 1;

	// Build node status lookup
	const nodeStatusMap = new Map<string, SwarmNode>();
	if (nodes) {
		for (const node of nodes) {
			nodeStatusMap.set(node.Hostname, node);
		}
	}

	// Auto-expand all nodes on first load
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

	// --- Render: loading state ---
	if (isLoading) {
		return (
			<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[40vh]">
				<span>Loading containers...</span>
				<Loader2 className="animate-spin size-4" />
			</div>
		);
	}

	// --- Render: swarm not active / unreachable (tRPC error) ---
	if (nodesError) {
		return (
			<SwarmNotAvailable
				errorMessage={nodesErrorDetail?.message}
				onRetry={() => refetchNodes()}
			/>
		);
	}

	// --- Render: nodes returned undefined (docker command failed silently) ---
	if (!nodesError && nodes === undefined) {
		return (
			<SwarmNotAvailable
				errorMessage="Docker Swarm may not be initialized — docker node ls returned no data."
				onRetry={() => refetchNodes()}
			/>
		);
	}

	// --- Render: swarm active but getNodeApps failed (real error, not just empty) ---
	const isRealAppsError =
		appsError && !appsErrorDetail?.message?.includes("data is undefined");
	if (isRealAppsError) {
		return (
			<div className="flex flex-col gap-4 py-6 max-w-2xl mx-auto">
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertTitle>Failed to Load Services</AlertTitle>
					<AlertDescription>
						Swarm is reachable but service listing failed.{" "}
						{appsErrorDetail?.message && (
							<span className="block mt-1 text-xs opacity-80">
								{appsErrorDetail.message}
							</span>
						)}
					</AlertDescription>
				</Alert>
				<div className="space-y-3 text-sm text-muted-foreground">
					<p>This could be caused by:</p>
					<ul className="list-disc list-inside space-y-1 ml-1">
						<li>Permission issues running Docker commands on the server</li>
						<li>Docker daemon not responding</li>
						<li>
							Network connectivity issues to a remote server &mdash; check{" "}
							<Link
								href="/dashboard/settings/cluster"
								className="text-primary underline underline-offset-4"
							>
								Cluster Settings
							</Link>
						</li>
					</ul>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="w-fit"
					onClick={() => refetchApps()}
				>
					<RefreshCw className="h-4 w-4 mr-2" />
					Retry
				</Button>
			</div>
		);
	}

	// --- Render: swarm active, but no services deployed ---
	if (!nodeApps || nodeApps.length === 0) {
		return (
			<div className="flex flex-col gap-4 py-6 max-w-2xl mx-auto">
				<Alert>
					<Info className="h-4 w-4" />
					<AlertTitle>No Swarm Services Found</AlertTitle>
					<AlertDescription>
						Docker Swarm is active with{" "}
						<strong>{nodes?.length ?? 0} node(s)</strong>, but there are no
						application services running in the swarm.
					</AlertDescription>
				</Alert>
				<div className="space-y-3 text-sm text-muted-foreground">
					<p>
						This view shows containers deployed as{" "}
						<strong>Swarm services</strong>. Standalone or Docker Compose
						containers won&apos;t appear here.
					</p>
					<p>
						To see containers in this view, make sure your applications are:
					</p>
					<ol className="list-decimal list-inside space-y-2 ml-1">
						<li>
							<strong>Deployed as Swarm services</strong> &mdash; Applications
							in Dokploy deploy to Swarm by default. Docker Compose projects
							need to use{" "}
							<code className="bg-muted px-1.5 py-0.5 rounded text-xs">
								Stack
							</code>{" "}
							type (not{" "}
							<code className="bg-muted px-1.5 py-0.5 rounded text-xs">
								Docker Compose
							</code>
							) to run as Swarm services.
						</li>
						<li>
							<strong>Using a registry</strong> (for multi-node setups) &mdash;
							Worker nodes need to pull images from a shared registry. Configure
							one in{" "}
							<Link
								href="/dashboard/settings/cluster"
								className="text-primary underline underline-offset-4"
							>
								Cluster Settings
							</Link>
							.
						</li>
						<li>
							<strong>Successfully built and deployed</strong> &mdash; Check
							your project&apos;s deployment logs for errors.
						</li>
					</ol>
					<DocLinks />
				</div>
				<Button
					variant="outline"
					size="sm"
					className="w-fit"
					onClick={() => refetchApps()}
				>
					<RefreshCw className="h-4 w-4 mr-2" />
					Refresh
				</Button>
			</div>
		);
	}

	// --- Render: services exist but no running containers ---
	if (runningContainers.length === 0) {
		const hasErrors = containers.some((c) => c.Error && c.Error.trim() !== "");
		return (
			<div className="flex flex-col gap-4 py-6 max-w-2xl mx-auto">
				<Alert>
					<AlertTriangle className="h-4 w-4" />
					<AlertTitle>No Running Containers</AlertTitle>
					<AlertDescription>
						Found <strong>{nodeApps.length} service(s)</strong> in the swarm,
						but none have running containers.
					</AlertDescription>
				</Alert>
				{hasErrors && (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>Container Errors Detected</AlertTitle>
						<AlertDescription>
							<ul className="list-disc list-inside space-y-1 mt-1">
								{containers
									.filter((c) => c.Error && c.Error.trim() !== "")
									.slice(0, 5)
									.map((c) => (
										<li key={c.ID} className="text-xs">
											<strong>{c.Name}</strong>: {c.Error}
										</li>
									))}
							</ul>
						</AlertDescription>
					</Alert>
				)}
				<div className="space-y-3 text-sm text-muted-foreground">
					<p>This can happen when:</p>
					<ul className="list-disc list-inside space-y-2 ml-1">
						<li>Services are scaled to 0 replicas</li>
						<li>
							Containers are failing to start &mdash; check deployment logs for
							errors
						</li>
						<li>
							Images can&apos;t be pulled on worker nodes &mdash; verify your{" "}
							<Link
								href="/dashboard/settings/cluster"
								className="text-primary underline underline-offset-4"
							>
								registry configuration
							</Link>
						</li>
						<li>
							Node constraints prevent scheduling &mdash; check placement rules
							in your app&apos;s Cluster settings
						</li>
					</ul>
					<DocLinks />
				</div>
				<Button
					variant="outline"
					size="sm"
					className="w-fit"
					onClick={() => {
						refetchApps();
						refetchDetails();
					}}
				>
					<RefreshCw className="h-4 w-4 mr-2" />
					Refresh
				</Button>
			</div>
		);
	}

	// --- Render: main view with data ---
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

			<div className="grid gap-4 md:grid-cols-3">
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Swarm Nodes</CardTitle>
						<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
							<Server className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{nodes?.length ?? 0}</div>
						{downNodes.length > 0 && (
							<p className="text-xs text-destructive mt-1">
								{downNodes.length} node(s) down or drained
							</p>
						)}
					</CardContent>
				</Card>

				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Services</CardTitle>
						<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
							<Cpu className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{nodeApps?.length ?? 0}</div>
						{unscheduledServices.length > 0 && (
							<p className="text-xs text-muted-foreground mt-1">
								{unscheduledServices.length} with no running tasks
							</p>
						)}
					</CardContent>
				</Card>

				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Running Containers
						</CardTitle>
						<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
							<Container className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{runningContainers.length}</div>
					</CardContent>
				</Card>
			</div>

			{/* Down / drained / unavailable node warning */}
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

			{/* Multi-node metrics limitation notice */}
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

			{/* Unscheduled services note */}
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

// --- Shared sub-components ---

const DocLinks = () => (
	<div className="flex flex-col gap-1 pt-2 border-t mt-2">
		<p className="text-xs font-medium text-muted-foreground">
			Helpful resources:
		</p>
		<div className="flex flex-wrap gap-x-4 gap-y-1">
			<a
				href="https://docs.dokploy.com/docs/core"
				target="_blank"
				rel="noopener noreferrer"
				className="text-xs text-primary underline underline-offset-4 inline-flex items-center gap-1"
			>
				Dokploy Documentation
				<ExternalLink className="h-3 w-3" />
			</a>
			<a
				href="https://docs.docker.com/engine/swarm/"
				target="_blank"
				rel="noopener noreferrer"
				className="text-xs text-primary underline underline-offset-4 inline-flex items-center gap-1"
			>
				Docker Swarm Guide
				<ExternalLink className="h-3 w-3" />
			</a>
			<Link
				href="/dashboard/settings/cluster"
				className="text-xs text-primary underline underline-offset-4 inline-flex items-center gap-1"
			>
				Cluster Settings
			</Link>
		</div>
	</div>
);

interface SwarmNotAvailableProps {
	errorMessage?: string;
	onRetry: () => void;
}

const SwarmNotAvailable = ({
	errorMessage,
	onRetry,
}: SwarmNotAvailableProps) => (
	<div className="flex flex-col gap-4 py-6 max-w-2xl mx-auto">
		<Alert variant="destructive">
			<AlertTriangle className="h-4 w-4" />
			<AlertTitle>Swarm Not Available</AlertTitle>
			<AlertDescription>
				Could not reach Docker Swarm.{" "}
				{errorMessage && (
					<span className="block mt-1 text-xs opacity-80">{errorMessage}</span>
				)}
			</AlertDescription>
		</Alert>
		<div className="space-y-3 text-sm text-muted-foreground">
			<p>
				This feature requires Docker Swarm to be initialized and active. To get
				started:
			</p>
			<ol className="list-decimal list-inside space-y-2 ml-1">
				<li>
					Initialize Swarm on your server:{" "}
					<code className="bg-muted px-1.5 py-0.5 rounded text-xs">
						docker swarm init
					</code>
				</li>
				<li>
					Verify it&apos;s active:{" "}
					<code className="bg-muted px-1.5 py-0.5 rounded text-xs">
						docker info | grep Swarm
					</code>
				</li>
				<li>
					Check the{" "}
					<Link
						href="/dashboard/settings/cluster"
						className="text-primary underline underline-offset-4"
					>
						Cluster Settings
					</Link>{" "}
					page to manage your swarm nodes
				</li>
			</ol>
			<DocLinks />
		</div>
		<Button variant="outline" size="sm" className="w-fit" onClick={onRetry}>
			<RefreshCw className="h-4 w-4 mr-2" />
			Retry
		</Button>
	</div>
);
