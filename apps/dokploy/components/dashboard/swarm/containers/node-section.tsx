import {
	ChevronDown,
	ChevronRight,
	Server,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ContainerRow } from "./container-row";
import type { ContainerStat, NodeGroup } from "./types";

interface NodeSectionProps {
	group: NodeGroup;
	isExpanded: boolean;
	onToggleNode: (nodeName: string) => void;
	findStatsForContainer: (taskName: string) => ContainerStat | undefined;
}

export const NodeSection = ({
	group,
	isExpanded,
	onToggleNode,
	findStatsForContainer,
}: NodeSectionProps) => {
	const runningCount = group.containers.filter((c) =>
		c.CurrentState.startsWith("Running"),
	).length;

	const nodeDown =
		group.nodeStatus &&
		(group.nodeStatus.Status !== "Ready" ||
			group.nodeStatus.Availability !== "Active");

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
								<div className="relative">
									<Server className="h-5 w-5 text-muted-foreground" />
									{nodeDown && (
										<span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive" />
									)}
								</div>
								<CardTitle className="text-base">
									{group.nodeName}
								</CardTitle>
								{group.nodeStatus && (
									<Badge
										variant={
											group.nodeStatus.ManagerStatus === "Leader"
												? "default"
												: group.nodeStatus.ManagerStatus === "Reachable"
													? "secondary"
													: "outline"
										}
										className="text-[10px]"
									>
										{group.nodeStatus.ManagerStatus || "Worker"}
									</Badge>
								)}
								<Badge variant="secondary">
									{group.containers.length} container
									{group.containers.length !== 1 ? "s" : ""}
								</Badge>
								{nodeDown ? (
									<Badge variant="destructive">
										{group.nodeStatus?.Status} / {group.nodeStatus?.Availability}
									</Badge>
								) : runningCount === group.containers.length ? (
									<Badge variant="default">All Running</Badge>
								) : (
									<Badge variant="orange">
										{runningCount}/{group.containers.length}{" "}
										Running
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
									<TableHead className="text-right">
										CPU
									</TableHead>
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
