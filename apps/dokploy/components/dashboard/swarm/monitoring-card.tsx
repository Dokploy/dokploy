import {
	Activity,
	Monitor,
	Server,
	ServerOff,
	Settings,
	WorkflowIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import { NodeCard } from "./details/details-card";

interface Props {
	serverId?: string;
}

export default function SwarmMonitorCard({ serverId }: Props) {
	const { data: nodes, isLoading } = api.swarm.getNodes.useQuery({
		serverId,
	});

	if (isLoading) {
		return (
			<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
				<div className="rounded-xl bg-background shadow-md p-6 flex flex-col gap-6">
					<div className="flex items-center flex-wrap gap-4 justify-between">
						<div className="space-y-2">
							<Skeleton className="h-6 w-56" />
							<Skeleton className="h-4 w-72" />
						</div>
						{!serverId && <Skeleton className="h-10 w-40" />}
					</div>
					<div className="grid gap-6 lg:grid-cols-3">
						{Array.from({ length: 3 }).map((_, index) => (
							<Card key={`swarm-stat-skeleton-${index}`} className="bg-background">
								<CardHeader className="space-y-2">
									<Skeleton className="h-4 w-24" />
									<Skeleton className="h-8 w-16" />
								</CardHeader>
							</Card>
						))}
					</div>
					<div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
						{Array.from({ length: 6 }).map((_, index) => (
							<Skeleton
								key={`swarm-node-skeleton-${index}`}
								className="h-40 w-full rounded-xl"
							/>
						))}
					</div>
				</div>
			</Card>
		);
	}

	if (!nodes) {
		return (
			<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
				<div className="rounded-xl bg-background shadow-md p-6">
					<Empty className="min-h-[55vh]">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ServerOff className="size-5 text-muted-foreground" />
							</EmptyMedia>
							<EmptyTitle>Unable to load swarm data</EmptyTitle>
							<EmptyDescription>
								We couldn't reach the swarm API. Check your server connection
								and try again.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button onClick={() => window.location.reload()}>Retry</Button>
						</EmptyContent>
					</Empty>
				</div>
			</Card>
		);
	}

	if (nodes.length === 0) {
		return (
			<Card className="h-full bg-sidebar p-2.5 rounded-xl mx-auto w-full">
				<div className="rounded-xl bg-background shadow-md p-6">
					<Empty className="min-h-[55vh]">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Server className="size-5 text-muted-foreground" />
							</EmptyMedia>
							<EmptyTitle>No swarm nodes yet</EmptyTitle>
							<EmptyDescription>
								Add nodes to start monitoring your cluster health and activity.
							</EmptyDescription>
						</EmptyHeader>
						{!serverId && (
							<EmptyContent>
								<Button
									onClick={() =>
										window.location.replace("/dashboard/settings/cluster")
									}
								>
									Manage Cluster
								</Button>
							</EmptyContent>
						)}
					</Empty>
				</div>
			</Card>
		);
	}

	const totalNodes = nodes.length;
	const activeNodesCount = nodes.filter(
		(node) => node.Status === "Ready",
	).length;
	const managerNodesCount = nodes.filter(
		(node) =>
			node.ManagerStatus === "Leader" || node.ManagerStatus === "Reachable",
	).length;
	const activeNodes = nodes.filter((node) => node.Status === "Ready");
	const managerNodes = nodes.filter(
		(node) =>
			node.ManagerStatus === "Leader" || node.ManagerStatus === "Reachable",
	);

	return (
		<Card className="h-full bg-sidebar  p-2.5 rounded-xl mx-auto w-full">
			<div className="rounded-xl bg-background shadow-md p-6 flex flex-col gap-4">
				<header className="flex items-center flex-wrap gap-4 justify-between">
					<div className="space-y-1">
						<CardTitle className="text-xl flex flex-row gap-2">
							<WorkflowIcon className="size-6 text-muted-foreground self-center" />
							Docker Swarm Overview
						</CardTitle>
						<p className="text-sm text-muted-foreground">
							Monitor and manage your Docker Swarm cluster
						</p>
					</div>
					{!serverId && (
						<Button
							onClick={() =>
								window.location.replace("/dashboard/settings/cluster")
							}
						>
							<Settings className="mr-2 h-4 w-4" />
							Manage Cluster
						</Button>
					)}
				</header>

				<div className="grid gap-6 lg:grid-cols-3">
					<Card className="bg-background">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Total Nodes</CardTitle>
							<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
								<Server className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{totalNodes}</div>
						</CardContent>
					</Card>

					<Card className="bg-background">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<div className="flex items-center gap-2">
								<CardTitle className="text-sm font-medium">
									Active Nodes
								</CardTitle>
								<Badge variant="green">Online</Badge>
							</div>
							<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
								<Activity className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
							</div>
						</CardHeader>
						<CardContent>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<div className="text-2xl font-bold">
											{activeNodesCount} / {totalNodes}
										</div>
									</TooltipTrigger>
									<TooltipContent>
										<div className="max-h-48 overflow-y-auto">
											{activeNodes.map((node) => (
												<div key={node.ID} className="flex items-center gap-2">
													{node.Hostname}
												</div>
											))}
										</div>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</CardContent>
					</Card>

					<Card className="bg-background">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<div className="flex items-center gap-2">
								<CardTitle className="text-sm font-medium">
									Manager Nodes
								</CardTitle>
								<Badge variant="green">Online</Badge>
							</div>
							<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
								<Monitor className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
							</div>
						</CardHeader>
						<CardContent>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<div className="text-2xl font-bold">
											{managerNodesCount} / {totalNodes}
										</div>
									</TooltipTrigger>
									<TooltipContent>
										<div className="max-h-48 overflow-y-auto">
											{managerNodes.map((node) => (
												<div key={node.ID} className="flex items-center gap-2">
													{node.Hostname}
												</div>
											))}
										</div>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</CardContent>
					</Card>
				</div>

				<div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
					{nodes.map((node) => (
						<NodeCard key={node.ID} node={node} serverId={serverId} />
					))}
				</div>
			</div>
		</Card>
	);
}
