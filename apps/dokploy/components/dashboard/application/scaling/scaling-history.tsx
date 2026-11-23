import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { api, type RouterOutputs } from "@/utils/api";

type ScalingEvent = RouterOutputs["scaling"]["events"]["events"][number];

const PAGE_SIZE = 10;

const ACTION_BADGES: Record<
	ScalingEvent["action"],
	{
		label: string;
		variant: "green" | "blue" | "yellow" | "orange" | "red" | "blank";
	}
> = {
	scale_up: { label: "Scaled up", variant: "green" },
	scale_down: { label: "Scaled down", variant: "blue" },
	set: { label: "Saved", variant: "blank" },
	hold: { label: "Held", variant: "yellow" },
	blocked: { label: "Blocked", variant: "orange" },
	error: { label: "Failed", variant: "red" },
	policy_change: { label: "Settings changed", variant: "blank" },
};

const SOURCE_LABELS: Record<ScalingEvent["source"], string> = {
	manual: "Manual",
	autoscaler: "Autoscaler",
	deploy: "Deploy",
	system: "System",
};

const actorOf = (event: ScalingEvent) => {
	if (!event.user) return SOURCE_LABELS[event.source];
	const name = `${event.user.firstName} ${event.user.lastName}`.trim();
	return name || event.user.email;
};

export type HistoryOwner =
	| { kind: "application"; applicationId: string }
	| { kind: "compose"; composeId: string };

export const ScalingHistory = ({ owner }: { owner: HistoryOwner }) => {
	const [page, setPage] = useState(0);
	const paging = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
	const applicationEvents = api.scaling.events.useQuery(
		{
			applicationId: owner.kind === "application" ? owner.applicationId : "",
			...paging,
		},
		{ enabled: owner.kind === "application", refetchInterval: 15000 },
	);
	const composeEvents = api.scaling.composeEvents.useQuery(
		{ composeId: owner.kind === "compose" ? owner.composeId : "", ...paging },
		{ enabled: owner.kind === "compose", refetchInterval: 15000 },
	);
	const { data, isLoading } =
		owner.kind === "application" ? applicationEvents : composeEvents;
	const showService = owner.kind === "compose";
	const total = data?.total ?? 0;
	const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Scaling history</CardTitle>
				<CardDescription>
					Every replica change, who made it, and whether it was applied.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>When</TableHead>
								{showService && <TableHead>Service</TableHead>}
								<TableHead>Result</TableHead>
								<TableHead>Replicas</TableHead>
								<TableHead>By</TableHead>
								<TableHead>Details</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{!isLoading && (data?.events.length ?? 0) === 0 && (
								<TableRow>
									<TableCell
										colSpan={showService ? 6 : 5}
										className="py-6 text-center text-sm text-muted-foreground"
									>
										No scaling changes yet.
									</TableCell>
								</TableRow>
							)}
							{data?.events.map((event) => {
								const badge = ACTION_BADGES[event.action];
								return (
									<TableRow key={event.scalingEventId}>
										<TableCell>
											<DateTooltip
												date={new Date(event.createdAt).toISOString()}
											/>
										</TableCell>
										{showService && (
											<TableCell className="font-mono text-xs">
												{event.serviceName}
											</TableCell>
										)}
										<TableCell>
											<Badge variant={badge.variant}>{badge.label}</Badge>
										</TableCell>
										<TableCell>
											{(event.fromReplicas !== null ||
												event.toReplicas !== null) && (
												<span className="flex items-center gap-1 font-mono text-sm">
													{event.fromReplicas ?? "—"}
													<ArrowRight className="size-3 text-muted-foreground" />
													{event.toReplicas ?? "—"}
												</span>
											)}
										</TableCell>
										<TableCell className="text-sm">{actorOf(event)}</TableCell>
										<TableCell className="max-w-[28rem] text-xs text-muted-foreground">
											{event.reason}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
				{total > PAGE_SIZE && (
					<div className="flex items-center justify-end gap-2">
						<span className="text-sm text-muted-foreground">
							Page {page + 1} of {lastPage + 1}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={page === 0}
							onClick={() => setPage((value) => value - 1)}
						>
							Newer
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= lastPage}
							onClick={() => setPage((value) => value + 1)}
						>
							Older
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
