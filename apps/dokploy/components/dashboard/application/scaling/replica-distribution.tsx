import { Badge } from "@/components/ui/badge";

interface Entry {
	nodeId: string;
	hostname: string | null;
	count: number;
}

/** How many current replicas each node runs, so uneven spread is visible. */
export const ReplicaDistribution = ({
	distribution,
}: {
	distribution: Entry[];
}) => {
	if (distribution.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-2 text-sm">
			<span className="text-muted-foreground">Replicas per node:</span>
			{distribution.map((entry) => (
				<Badge key={entry.nodeId} variant="blank" className="font-normal">
					<span className="font-mono">
						{entry.hostname ?? entry.nodeId.slice(0, 12)}
					</span>
					<span className="ml-1.5 tabular-nums">{entry.count}</span>
				</Badge>
			))}
		</div>
	);
};
