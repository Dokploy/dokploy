import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { RouterOutputs } from "@/utils/api";
import { formatCpu, formatMemory } from "./format";

type Capacity = RouterOutputs["scaling"]["capacity"];
type Warning = Capacity["warnings"][number];

const ELIGIBILITY_BADGES = {
	eligible: { label: "Eligible", variant: "green" },
	ineligible: { label: "Not eligible", variant: "blank" },
	unknown: { label: "Unknown", variant: "yellow" },
} as const;

export const CapacityWarnings = ({ warnings }: { warnings: Warning[] }) => (
	<>
		{warnings.map((warning) => (
			<AlertBlock
				key={warning.code}
				type={warning.severity === "warning" ? "warning" : "info"}
			>
				{warning.message}
			</AlertBlock>
		))}
	</>
);

const summaryOf = (capacity: Capacity) => {
	const nodes = `${capacity.eligibleNodes} eligible node${capacity.eligibleNodes === 1 ? "" : "s"}`;
	if (capacity.placeable === null) {
		return `${nodes}. The replica count is not limited by reservations.`;
	}
	return `${nodes}, with room for ${capacity.placeable} replica${capacity.placeable === 1 ? "" : "s"} of this application.`;
};

export const CapacityCard = ({
	capacity,
	error,
}: {
	capacity: Capacity | undefined;
	error: string | null;
}) => (
	<Card className="bg-background">
		<CardHeader>
			<CardTitle className="text-xl">Capacity</CardTitle>
			<CardDescription>
				Where replicas can run and how many fit, based on CPU and memory
				reservations. Limits cap usage but are not counted as reserved.
			</CardDescription>
		</CardHeader>
		<CardContent className="flex flex-col gap-4">
			{error && <AlertBlock type="error">{error}</AlertBlock>}
			{capacity && (
				<>
					<p className="text-sm">
						{summaryOf(capacity)}
						{!capacity.deployed &&
							" Based on the saved settings, since the application is not deployed yet."}
					</p>
					<CapacityWarnings warnings={capacity.warnings} />
					{capacity.nodeDetails ? (
						<NodeTable nodes={capacity.nodes} />
					) : (
						<p className="text-sm text-muted-foreground">
							Per-node details are shown to users with Docker access.
						</p>
					)}
				</>
			)}
		</CardContent>
	</Card>
);

const NodeTable = ({ nodes }: { nodes: Capacity["nodes"] }) => (
	<div className="rounded-md border">
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Node</TableHead>
					<TableHead>Placement</TableHead>
					<TableHead>CPU unreserved / total</TableHead>
					<TableHead>Memory unreserved / total</TableHead>
					<TableHead>This app</TableHead>
					<TableHead>Room for</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{nodes.map((node) => {
					const badge = ELIGIBILITY_BADGES[node.eligibility];
					return (
						<TableRow key={node.id}>
							<TableCell>
								<div className="flex flex-col">
									<span className="text-sm">
										{node.hostname ?? node.id.slice(0, 12)}
									</span>
									<span className="text-xs text-muted-foreground">
										{node.role}
									</span>
								</div>
							</TableCell>
							<TableCell>
								<div className="flex flex-col gap-1">
									<Badge variant={badge.variant} className="w-fit">
										{badge.label}
									</Badge>
									{node.reason && (
										<span className="text-xs text-muted-foreground">
											{node.reason}
										</span>
									)}
								</div>
							</TableCell>
							<TableCell className="text-sm tabular-nums">
								{formatCpu(node.cpu.available)} / {formatCpu(node.cpu.total)}
							</TableCell>
							<TableCell className="text-sm tabular-nums">
								{formatMemory(node.memory.available)} /{" "}
								{formatMemory(node.memory.total)}
							</TableCell>
							<TableCell className="tabular-nums">{node.appReplicas}</TableCell>
							<TableCell className="tabular-nums">
								{node.slots === null ? "No limit" : node.slots}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	</div>
);
