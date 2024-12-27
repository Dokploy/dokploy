import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import {
	AlertCircle,
	CheckCircle,
	HelpCircle,
	Loader2,
	Server,
} from "lucide-react";
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
			<div className="mx-auto w-full max-w-7xl">
				<div className="mb-6 h-full min-h-[55vh] rounded-lg border">
					<div className="flex h-full items-center justify-center text-muted-foreground">
						<Loader2 className="h-6 w-6 animate-spin" />
					</div>
				</div>
			</div>
		);
	}

	if (!nodes) {
		return (
			<div className="mx-auto w-full max-w-7xl">
				<div className="mb-6 h-full min-h-[55vh] rounded-lg border">
					<div className="flex h-full items-center justify-center text-destructive">
						<span>Failed to load data</span>
					</div>
				</div>
			</div>
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

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "Ready":
				return <CheckCircle className="h-4 w-4 text-green-500" />;
			case "Down":
				return <AlertCircle className="h-4 w-4 text-red-500" />;
			case "Disconnected":
				return <AlertCircle className="h-4 w-4 text-red-800" />;
			default:
				return <HelpCircle className="h-4 w-4 text-yellow-500" />;
		}
	};

	return (
		<div className="mx-auto w-full max-w-7xl">
			<div className="mb-4 flex items-center justify-between">
				<h1 className="font-bold text-xl">Docker Swarm Overview</h1>
				{!serverId && (
					<Button
						type="button"
						onClick={() =>
							window.location.replace("/dashboard/settings/cluster")
						}
					>
						Manage Cluster
					</Button>
				)}
			</div>
			<Card className="mb-6 bg-transparent">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="flex items-center gap-2 text-xl">
						<Server className="size-4" />
						Monitor
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<div className="flex items-center justify-between">
							<span className="font-medium text-sm">Total Nodes:</span>
							<Badge variant="secondary">{totalNodes}</Badge>
						</div>
						<div className="flex items-center justify-between">
							<span className="font-medium text-sm">Active Nodes:</span>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Badge
											variant="secondary"
											className="bg-green-100 text-black dark:bg-green-400"
										>
											{activeNodesCount} / {totalNodes}
										</Badge>
									</TooltipTrigger>
									<TooltipContent>
										<div className="max-h-48 overflow-y-auto">
											{activeNodes.map((node) => (
												<div key={node.ID} className="flex items-center gap-2">
													{getStatusIcon(node.Status)}
													{node.Hostname}
												</div>
											))}
										</div>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
						<div className="flex items-center justify-between">
							<span className="font-medium text-sm">Manager Nodes:</span>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Badge
											variant="secondary"
											className="bg-blue-100 text-black dark:bg-blue-400"
										>
											{managerNodesCount} / {totalNodes}
										</Badge>
									</TooltipTrigger>
									<TooltipContent>
										<div className="max-h-48 overflow-y-auto">
											{managerNodes.map((node) => (
												<div key={node.ID} className="flex items-center gap-2">
													{getStatusIcon(node.Status)}
													{node.Hostname}
												</div>
											))}
										</div>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
					<div className="mt-4 border-t pt-4">
						<h4 className="mb-2 font-semibold text-sm">Node Status:</h4>
						<ul className="space-y-2">
							{nodes.map((node) => (
								<li
									key={node.ID}
									className="flex items-center justify-between text-sm"
								>
									<span className="flex items-center gap-2">
										{getStatusIcon(node.Status)}
										{node.Hostname}
									</span>
									<Badge variant="outline" className="text-xs">
										{node.ManagerStatus || "Worker"}
									</Badge>
								</li>
							))}
						</ul>
					</div>
				</CardContent>
			</Card>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{nodes.map((node) => (
					<NodeCard key={node.ID} node={node} serverId={serverId} />
				))}
			</div>
		</div>
	);
}
