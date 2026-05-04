import { Container, Cpu, Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SummaryCardsProps {
	nodeCount: number;
	downNodeCount: number;
	serviceCount: number;
	unscheduledCount: number;
	runningContainerCount: number;
}

export const SummaryCards = ({
	nodeCount,
	downNodeCount,
	serviceCount,
	unscheduledCount,
	runningContainerCount,
}: SummaryCardsProps) => (
	<div className="grid gap-4 md:grid-cols-3">
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">Swarm Nodes</CardTitle>
				<div className="p-2 bg-emerald-600/20 text-emerald-600 rounded-md">
					<Server className="h-4 w-4 text-muted-foreground dark:text-emerald-600" />
				</div>
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-bold">{nodeCount}</div>
				{downNodeCount > 0 && (
					<p className="text-xs text-destructive mt-1">
						{downNodeCount} node(s) down or drained
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
				<div className="text-2xl font-bold">{serviceCount}</div>
				{unscheduledCount > 0 && (
					<p className="text-xs text-muted-foreground mt-1">
						{unscheduledCount} with no running tasks
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
				<div className="text-2xl font-bold">{runningContainerCount}</div>
			</CardContent>
		</Card>
	</div>
);
