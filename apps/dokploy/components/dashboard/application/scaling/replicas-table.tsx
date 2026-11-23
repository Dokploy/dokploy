import { DateTooltip } from "@/components/shared/date-tooltip";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { RouterOutputs } from "@/utils/api";

type Replica = RouterOutputs["scaling"]["status"]["replicas"][number];

interface ReplicaLists {
	replicas: Replica[];
	recentFailures: Replica[];
}

const PHASE_BADGES: Record<
	Replica["phase"],
	{
		label: string;
		variant: "green" | "blue" | "yellow" | "orange" | "red" | "blank";
	}
> = {
	ready: { label: "Ready", variant: "green" },
	starting: { label: "Starting", variant: "blue" },
	pending: { label: "Pending", variant: "yellow" },
	stopping: { label: "Stopping", variant: "orange" },
	failed: { label: "Failed", variant: "red" },
	completed: { label: "Completed", variant: "blank" },
	stopped: { label: "Stopped", variant: "blank" },
};

const ReplicaRows = ({
	replicas,
	unplacedLabel,
}: {
	replicas: Replica[];
	unplacedLabel: string;
}) => (
	<>
		{replicas.map((replica) => {
			const badge = PHASE_BADGES[replica.phase];
			return (
				<TableRow key={replica.taskId}>
					<TableCell className="font-mono text-xs">
						{replica.slot ?? "—"}
					</TableCell>
					<TableCell>
						<Badge variant={badge.variant}>{badge.label}</Badge>
					</TableCell>
					<TableCell>{replica.receivesTraffic ? "Yes" : "No"}</TableCell>
					<TableCell className="text-sm">
						{replica.node?.hostname ??
							replica.node?.id.slice(0, 12) ??
							unplacedLabel}
					</TableCell>
					<TableCell>
						{replica.since ? <DateTooltip date={replica.since} /> : "—"}
					</TableCell>
					{replica.cause ? (
						<TableCell className="max-w-[32rem] whitespace-normal text-xs">
							<p>{replica.cause}</p>
							{replica.error && (
								<p
									className="mt-1 truncate text-muted-foreground"
									title={replica.error}
								>
									{replica.error}
								</p>
							)}
						</TableCell>
					) : (
						<TableCell className="max-w-[24rem] truncate text-xs text-muted-foreground">
							<span title={replica.error ?? replica.message ?? undefined}>
								{replica.error ?? replica.message ?? ""}
							</span>
						</TableCell>
					)}
				</TableRow>
			);
		})}
	</>
);

const ReplicaTableHeader = () => (
	<TableHeader>
		<TableRow>
			<TableHead className="w-16">Slot</TableHead>
			<TableHead>State</TableHead>
			<TableHead>Receives traffic</TableHead>
			<TableHead>Node</TableHead>
			<TableHead>Since</TableHead>
			<TableHead>Details</TableHead>
		</TableRow>
	</TableHeader>
);

// Plain Compose containers have no Swarm node; they run where Compose ran.
export const ReplicasTable = ({
	status,
	unplacedLabel = "Unassigned",
}: {
	status: ReplicaLists;
	unplacedLabel?: string;
}) => (
	<div className="flex flex-col gap-4">
		<div className="rounded-md border">
			<Table>
				<ReplicaTableHeader />
				<TableBody>
					{status.replicas.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={6}
								className="py-6 text-center text-sm text-muted-foreground"
							>
								No replicas are running.
							</TableCell>
						</TableRow>
					) : (
						<ReplicaRows
							replicas={status.replicas}
							unplacedLabel={unplacedLabel}
						/>
					)}
				</TableBody>
			</Table>
		</div>

		{status.recentFailures.length > 0 && (
			<div className="flex flex-col gap-2">
				<h3 className="text-sm font-medium">Failures in the last 15 minutes</h3>
				<div className="rounded-md border">
					<Table>
						<ReplicaTableHeader />
						<TableBody>
							<ReplicaRows
								replicas={status.recentFailures}
								unplacedLabel={unplacedLabel}
							/>
						</TableBody>
					</Table>
				</div>
			</div>
		)}
	</div>
);
