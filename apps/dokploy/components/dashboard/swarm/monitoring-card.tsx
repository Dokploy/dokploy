import { Activity, Loader2, Monitor, Server, Settings } from "lucide-react";
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
import { NodeCard } from "./details/details-card";

interface Props {
	serverId?: string;
}

export default function SwarmMonitorCard({ serverId }: Props) {
	const { data: nodes, isPending } = api.swarm.getNodes.useQuery({
		serverId,
	});

	if (isPending) {
		return (
			<div className="w-full">
				<div className="mb-6 border min-h-[55vh] flex rounded-lg h-full items-center justify-center  text-muted-foreground">
					{/* <div className="flex items-center justify-center h-full text-muted-foreground"> */}

					<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground min-h-[55vh]">
						<span>Loading...</span>
						<Loader2 className="animate-spin size-4" />
					</div>
					{/* </div> */}
				</div>
			</div>
		);
	}

	if (!nodes) {
		return (
			<div className="w-full">
				<div className="mb-6 border min-h-[55vh] flex justify-center items-center rounded-lg h-full">
					<div className="flex items-center justify-center h-full  text-destructive">
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

	return (
		<div className="flex flex-col gap-4">
			{!serverId && (
				<div className="flex justify-end">
					<Button
						onClick={() =>
							window.location.replace("/dashboard/settings/cluster")
						}
					>
						<Settings className="mr-2 h-4 w-4" />
						Manage Cluster
					</Button>
				</div>
			)}

			<div className="grid gap-6 lg:grid-cols-3">
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Nodes</CardTitle>
						<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
							<Server className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-semibold">{totalNodes}</div>
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
									<div className="text-2xl font-semibold">
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
									<div className="text-2xl font-semibold">
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
	);
}
