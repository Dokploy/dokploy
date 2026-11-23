import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DateTooltip } from "@/components/shared/date-tooltip";
import { DialogAction } from "@/components/shared/dialog-action";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api, type RouterOutputs } from "@/utils/api";
import { readableErrorMessage } from "@/utils/error-message";
import {
	formatCoreAmount,
	formatCores,
	formatMemory,
	formatPercent,
} from "./format";
import { ReplicaMetricsChart } from "./replica-metrics-chart";
import type { ScaleTarget } from "./scale-target";

type Metrics = RouterOutputs["scaling"]["metrics"];
type MetricsData = NonNullable<Metrics["data"]>;

const RANGES = [
	{ minutes: 15, label: "Last 15 minutes" },
	{ minutes: 60, label: "Last hour" },
	{ minutes: 360, label: "Last 6 hours" },
] as const;

const StatTile = ({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string | null;
}) => (
	<div className="flex flex-col gap-1 rounded-lg border p-4">
		<span className="text-sm text-muted-foreground">{label}</span>
		<span className="text-2xl font-semibold tabular-nums">{value}</span>
		{hint && <span className="text-xs text-muted-foreground">{hint}</span>}
	</div>
);

const basisHint = (
	percent: number | null,
	source: MetricsData["summary"]["basis"]["cpuSource"],
) => {
	const formatted = formatPercent(percent);
	if (!formatted || !source) return "No reservation or limit to compare with";
	return `${formatted} of its ${source}`;
};

const MetricsView = ({ data }: { data: MetricsData }) => {
	const { summary } = data;
	const { basis } = summary;
	const unreachable = data.nodes.filter(
		(node) => !node.reachable && !node.error?.startsWith("node is"),
	);

	return (
		<>
			{data.partial && (
				<AlertBlock type="warning">
					{summary.coverage.fresh} of {summary.coverage.ready} ready replicas
					have a recent reading, so the figures below are incomplete.
					{unreachable.length > 0 &&
						` No answer from the agent on ${unreachable.map((node) => node.hostname).join(", ")}.`}
				</AlertBlock>
			)}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<StatTile
					label="Average CPU per replica"
					value={
						summary.averages.cpuCores === null
							? "—"
							: formatCores(summary.averages.cpuCores)
					}
					hint={basisHint(summary.averages.cpuPercent, basis.cpuSource)}
				/>
				<StatTile
					label="Average memory per replica"
					value={
						summary.averages.memoryBytes === null
							? "—"
							: formatMemory(summary.averages.memoryBytes)
					}
					hint={basisHint(summary.averages.memoryPercent, basis.memorySource)}
				/>
				<StatTile
					label="Replicas reporting"
					value={`${summary.coverage.fresh} / ${summary.coverage.ready}`}
					hint={`Read every ${data.refreshRateSeconds} seconds`}
				/>
			</div>

			{data.series.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No readings in this range yet. The agent needs two readings of a
					replica before it can report its CPU use.
				</p>
			) : (
				<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
					<div className="flex flex-col gap-2">
						<h3 className="text-sm font-medium">CPU (cores)</h3>
						<ReplicaMetricsChart
							series={data.series}
							metric="cpuCores"
							refreshRateSeconds={data.refreshRateSeconds}
							formatValue={formatCores}
							formatTick={formatCoreAmount}
							minimumAxisMax={0.01}
							reference={
								basis.cpuCores && basis.cpuSource
									? {
											value: basis.cpuCores,
											label:
												basis.cpuSource === "reservation"
													? "Reserved"
													: "Limit",
										}
									: null
							}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<h3 className="text-sm font-medium">Memory</h3>
						<ReplicaMetricsChart
							series={data.series}
							metric="memoryBytes"
							refreshRateSeconds={data.refreshRateSeconds}
							formatValue={formatMemory}
							formatTick={formatMemory}
							minimumAxisMax={8 * 1024 * 1024}
							reference={
								basis.memoryBytes && basis.memorySource
									? {
											value: basis.memoryBytes,
											label:
												basis.memorySource === "reservation"
													? "Reserved"
													: "Limit",
										}
									: null
							}
						/>
					</div>
				</div>
			)}

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-16">Slot</TableHead>
							<TableHead>CPU</TableHead>
							<TableHead>Memory</TableHead>
							<TableHead>Last reading</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{summary.replicas.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={4}
									className="py-6 text-center text-sm text-muted-foreground"
								>
									No replica is ready.
								</TableCell>
							</TableRow>
						)}
						{summary.replicas.map((replica) => (
							<TableRow key={replica.taskId}>
								<TableCell className="font-mono text-xs">
									{replica.slot ?? "—"}
								</TableCell>
								<TableCell className="tabular-nums">
									{replica.cpuCores === null
										? "—"
										: `${formatCores(replica.cpuCores)}${replica.cpuPercent === null ? "" : ` (${formatPercent(replica.cpuPercent)})`}`}
								</TableCell>
								<TableCell className="tabular-nums">
									{replica.memoryBytes === null
										? "—"
										: `${formatMemory(replica.memoryBytes)}${replica.memoryPercent === null ? "" : ` (${formatPercent(replica.memoryPercent)})`}`}
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
										{replica.sampledAt ? (
											<DateTooltip date={replica.sampledAt} />
										) : (
											<span className="text-muted-foreground">None</span>
										)}
										{!replica.fresh && <Badge variant="yellow">Stale</Badge>}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</>
	);
};

const SETUP_MESSAGES: Record<
	"not_configured" | "collection_disabled" | "outdated",
	string
> = {
	not_configured:
		"Per-replica metrics come from Dokploy's metrics agent, which is not set up on this server.",
	collection_disabled:
		"The metrics agent is installed on this server, but per-replica collection is turned off.",
	outdated:
		"The metrics agent on this server is older than this version of Dokploy and does not read plain Docker Compose containers.",
};

const AgentSetup = ({
	target,
	status,
	canInstall,
}: {
	target: ScaleTarget;
	status: keyof typeof SETUP_MESSAGES;
	canInstall: boolean;
}) => {
	const utils = api.useUtils();
	const applicationSetup = api.scaling.setupMetricsAgent.useMutation();
	const composeSetup = api.scaling.setupComposeMetricsAgent.useMutation();
	const update = status === "outdated";

	const install = async () => {
		await (target.kind === "application"
			? applicationSetup.mutateAsync({ applicationId: target.applicationId })
			: composeSetup.mutateAsync({ composeId: target.composeId })
		)
			.then(() =>
				toast.success(
					`Metrics agent ${update ? "updated" : "deployed"}. Readings appear after two collection rounds.`,
				),
			)
			.catch((error) =>
				toast.error(
					readableErrorMessage(error, "Error deploying the metrics agent"),
				),
			);
		await (target.kind === "application"
			? utils.scaling.metrics.invalidate({
					applicationId: target.applicationId,
				})
			: utils.scaling.composeMetrics.invalidate({
					composeId: target.composeId,
				}));
	};

	return (
		<div className="flex flex-col gap-3">
			<AlertBlock type={update ? "warning" : "info"}>
				{SETUP_MESSAGES[status]} It runs on every node of the server's swarm and
				reads each replica's CPU and memory from Docker.
			</AlertBlock>
			{canInstall ? (
				<DialogAction
					title={
						update ? "Update the metrics agent?" : "Enable replica metrics?"
					}
					description="Dokploy will run its metrics agent (the dokploy-monitoring service) on every node of this server's swarm, publishing its port (4500 unless configured otherwise) on each node. Open that port between the nodes and to Dokploy only. An agent from an earlier version is replaced, and its stored history is not carried over."
					type="default"
					onClick={install}
				>
					<Button
						className="w-fit"
						isLoading={applicationSetup.isPending || composeSetup.isPending}
					>
						{update ? "Update the metrics agent" : "Enable replica metrics"}
					</Button>
				</DialogAction>
			) : (
				<p className="text-sm text-muted-foreground">
					Ask an administrator to {update ? "update" : "enable"} the metrics
					agent for this server.
				</p>
			)}
		</div>
	);
};

const useReplicaMetrics = (target: ScaleTarget, rangeMinutes: number) => {
	const options = { refetchInterval: 15000 };
	const application = api.scaling.metrics.useQuery(
		{
			applicationId: target.kind === "application" ? target.applicationId : "",
			rangeMinutes,
		},
		{ ...options, enabled: target.kind === "application" },
	);
	const compose = api.scaling.composeMetrics.useQuery(
		{
			composeId: target.kind === "compose" ? target.composeId : "",
			serviceName: target.kind === "compose" ? target.serviceName : "",
			rangeMinutes,
		},
		{ ...options, enabled: target.kind === "compose" },
	);
	return target.kind === "application" ? application : compose;
};

export const MetricsCard = ({
	target,
	canInstall,
}: {
	target: ScaleTarget;
	canInstall: boolean;
}) => {
	const [rangeMinutes, setRangeMinutes] = useState<number>(60);
	const { data, error, isLoading } = useReplicaMetrics(target, rangeMinutes);
	const oneServer = target.kind === "compose" && target.engine === "compose";

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div>
					<CardTitle className="text-xl">Replica metrics</CardTitle>
					<CardDescription>
						CPU and memory used by each replica, read by the metrics agent on{" "}
						{oneServer ? "this server" : "every node"}.
					</CardDescription>
				</div>
				<Select
					value={String(rangeMinutes)}
					onValueChange={(value) => setRangeMinutes(Number(value))}
				>
					<SelectTrigger className="w-40" aria-label="Time range">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{RANGES.map((range) => (
							<SelectItem key={range.minutes} value={String(range.minutes)}>
								{range.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isLoading && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Reading metrics…
					</div>
				)}
				{error && <AlertBlock type="error">{error.message}</AlertBlock>}
				{data?.agent.status === "unreachable" && (
					<AlertBlock type="error">
						{data.agent.message} Check that the agent's port is reachable from
						Dokploy and between the swarm's nodes.
					</AlertBlock>
				)}
				{(data?.agent.status === "not_configured" ||
					data?.agent.status === "collection_disabled" ||
					data?.agent.status === "outdated") && (
					<AgentSetup
						target={target}
						status={data.agent.status}
						canInstall={canInstall}
					/>
				)}
				{data?.data && <MetricsView data={data.data} />}
			</CardContent>
		</Card>
	);
};
