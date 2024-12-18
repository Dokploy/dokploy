import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";
import {
	Activity,
	AlertCircle,
	CheckCircle,
	HelpCircle,
	Loader2,
	Server,
} from "lucide-react";
import { NodeCard } from "./details/deatils-card";

export interface SwarmList {
	ID: string;
	Hostname: string;
	Availability: string;
	EngineVersion: string;
	Status: string;
	ManagerStatus: string;
	TLSStatus: string;
}

interface SwarmMonitorCardProps {
	nodes: SwarmList[];
}

export default function SwarmMonitorCard() {
	const { data: nodes, isLoading } = api.swarm.getNodes.useQuery();

	if (isLoading) {
		return (
			<div className="w-full max-w-7xl mx-auto">
				<Card className="mb-6">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Activity className="h-6 w-6" />
							Docker Swarm Monitor
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-center justify-center">
							<Loader2 className="h-6 w-6 animate-spin" />
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!nodes) {
		return (
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertCircle className="h-6 w-6" />
						Docker Swarm Monitor
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center">
						<span>Failed to load data</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	console.log(nodes);
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
		<div className="w-full max-w-7xl mx-auto">
			<Card className="mb-6 bg-transparent">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<Server className="h-6 w-6" />
						Docker Swarm Monitor
					</CardTitle>
					{/* <Button
						variant="outline"
						size="sm"
						onClick={handleRefresh}
						disabled={isRefreshing}
					>
						<RefreshCw
							className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button> */}
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<div className="flex justify-between items-center">
							<span className="text-sm font-medium">Total Nodes:</span>
							<Badge variant="secondary">{totalNodes}</Badge>
						</div>
						<div className="flex justify-between items-center">
							<span className="text-sm font-medium">Active Nodes:</span>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Badge
											variant="secondary"
											className="bg-green-100 dark:bg-green-400 text-black"
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
						<div className="flex justify-between items-center">
							<span className="text-sm font-medium">Manager Nodes:</span>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Badge
											variant="secondary"
											className="bg-blue-100 dark:bg-blue-400 text-black"
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
					<div className="border-t pt-4 mt-4">
						<h4 className="text-sm font-semibold mb-2">Node Status:</h4>
						<ul className="space-y-2">
							{nodes.map((node) => (
								<li
									key={node.ID}
									className="flex justify-between items-center text-sm"
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
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{nodes.map((node) => (
					<NodeCard key={node.ID} node={node} />
				))}
			</div>
		</div>
	);
}
