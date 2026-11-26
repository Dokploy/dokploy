import { Loader2, RefreshCw } from "lucide-react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api, type RouterOutputs } from "@/utils/api";
import { ShowResources } from "../advanced/show-resources";
import {
	AutoscalingCard,
	autoscalingReason,
	cpuCapacityOf,
	useAutoscaling,
} from "./autoscaling-card";
import { BlueGreenCard } from "./blue-green-card";
import { CapacityCard } from "./capacity-card";
import { ManualScaleControl } from "./manual-scale-control";
import { MetricsCard } from "./metrics-card";
import { PlacementCard } from "./placement-card";
import { ReplicaDistribution } from "./replica-distribution";
import { ReplicasTable } from "./replicas-table";
import { RolloutCard } from "./rollout-card";
import { ScalingHistory } from "./scaling-history";

type ScalingStatus = RouterOutputs["scaling"]["status"];

const MODE_LABELS: Record<ScalingStatus["mode"], string> = {
	replicated: "replicated",
	global: "global (one task per node)",
	"replicated-job": "replicated job",
	"global-job": "global job",
};

export const StatTile = ({
	label,
	value,
	hint,
}: {
	label: string;
	value: number | string;
	hint?: string;
}) => (
	<div className="flex flex-col gap-1 rounded-lg border p-4">
		<span className="text-sm text-muted-foreground">{label}</span>
		<span className="text-2xl font-semibold tabular-nums">{value}</span>
		{hint && <span className="text-xs text-muted-foreground">{hint}</span>}
	</div>
);

const scaleDisabledReason = (status: ScalingStatus) => {
	if (status.mode !== "replicated") {
		return `The replica count does not apply to services in ${MODE_LABELS[status.mode]} mode. Change the mode in Advanced → Cluster Settings → Swarm Settings.`;
	}
	if (status.rolloutInProgress) {
		return "A rollout is in progress. Scaling is available again once it finishes.";
	}
	return null;
};

const StatusNotices = ({ status }: { status: ScalingStatus }) => (
	<>
		{!status.deployed && (
			<AlertBlock type="info">
				This application has not been deployed yet. The replica count you set
				here is used on the first deploy.
			</AlertBlock>
		)}
		{status.stopped && (
			<AlertBlock type="info">
				The service is stopped. Starting or redeploying it brings back{" "}
				{status.configured} replica(s).
			</AlertBlock>
		)}
		{status.deployed && !status.inSync && (
			<AlertBlock type="warning">
				Swarm is running {status.desired} replica(s) but Dokploy is configured
				for {status.configured}. The configured count is applied on the next
				deploy, or apply it now below.
			</AlertBlock>
		)}
		{status.rolloutInProgress && (
			<AlertBlock type="info">
				Rollout {status.updateStatus?.state}
				{status.updateStatus?.message ? `: ${status.updateStatus.message}` : ""}
			</AlertBlock>
		)}
		{status.pendingReasons.map((reason) => (
			<AlertBlock key={reason} type="warning">
				Swarm cannot place some replicas: {reason}
			</AlertBlock>
		))}
		{status.deployed && !status.dokployHealthCheck && (
			<AlertBlock type="info">
				No health check is configured in Dokploy, so a replica counts as ready
				as soon as its container runs, unless the image defines its own
				HEALTHCHECK. Configure one in Advanced → Cluster Settings → Swarm
				Settings so traffic only reaches replicas that can serve it.
			</AlertBlock>
		)}
	</>
);

export const ShowScaling = ({ applicationId }: { applicationId: string }) => {
	const { data: permissions } = api.user.getPermissions.useQuery();
	const {
		data: status,
		error,
		isLoading,
		isFetching,
		refetch,
	} = api.scaling.status.useQuery({ applicationId }, { refetchInterval: 5000 });
	const canConfigure = !!permissions?.service.create;
	const { data: autoscaling } = useAutoscaling({
		kind: "application",
		applicationId,
	});
	const capacityQuery = api.scaling.capacity.useQuery(
		{ applicationId, replicas: Math.max(1, status?.configured ?? 1) },
		{ enabled: !!status, refetchInterval: 15000 },
	);
	const { data: settings } = api.scaling.settings.useQuery(
		{ applicationId },
		{ enabled: canConfigure },
	);
	const { data: placementNodes } = api.scaling.placementNodes.useQuery(
		{ applicationId },
		{ enabled: canConfigure && !!permissions?.docker.read },
	);

	return (
		<div className="flex flex-col gap-4">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-start justify-between gap-4">
					<div>
						<CardTitle className="text-xl">Replicas</CardTitle>
						<CardDescription>
							Run several copies of this application. Traffic from its domains
							is spread across the replicas that are ready.
						</CardDescription>
					</div>
					<Button
						variant="outline"
						size="icon"
						aria-label="Refresh replica status"
						onClick={() => refetch()}
						disabled={isFetching}
					>
						<RefreshCw
							className={isFetching ? "size-4 animate-spin" : "size-4"}
						/>
					</Button>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{isLoading && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							Reading replica status…
						</div>
					)}
					{error && <AlertBlock type="error">{error.message}</AlertBlock>}
					{status && (
						<>
							<div className="grid gap-4 grid-cols-2 md:grid-cols-4">
								<StatTile
									label="Desired"
									value={status.desired ?? "—"}
									hint={
										status.inSync
											? undefined
											: `Configured: ${status.configured}`
									}
								/>
								<StatTile
									label="Ready"
									value={status.counts.ready}
									hint="Receiving traffic"
								/>
								<StatTile
									label="Starting / pending"
									value={status.counts.starting + status.counts.pending}
								/>
								<StatTile
									label="Failed"
									value={status.counts.failedRecent}
									hint="Last 15 minutes"
								/>
							</div>
							<StatusNotices status={status} />
							{permissions?.deployment.create && (
								<ManualScaleControl
									target={{ kind: "application", applicationId }}
									configured={status.configured}
									running={status.desired}
									disabledReason={
										autoscalingReason(autoscaling) ??
										scaleDisabledReason(status)
									}
								/>
							)}
							<ReplicaDistribution distribution={status.distribution} />
							<ReplicasTable status={status} />
						</>
					)}
				</CardContent>
			</Card>
			<AutoscalingCard
				target={{ kind: "application", applicationId }}
				canConfigure={canConfigure && !!permissions?.deployment.create}
				currentReplicas={status?.desired ?? status?.configured ?? null}
				cpuCapacity={cpuCapacityOf(capacityQuery.data)}
			/>
			{permissions?.monitoring.read && (
				<MetricsCard
					target={{ kind: "application", applicationId }}
					canInstall={!!permissions?.server.create}
				/>
			)}
			<CapacityCard
				capacity={capacityQuery.data}
				error={capacityQuery.error?.message ?? null}
			/>
			{canConfigure && (
				<>
					<ShowResources id={applicationId} type="application" />
					{settings && (
						<>
							<RolloutCard applicationId={applicationId} settings={settings} />
							<BlueGreenCard applicationId={applicationId} />
							<PlacementCard
								target={{ kind: "application", applicationId }}
								placement={settings.placement}
								nodes={placementNodes ?? []}
							/>
						</>
					)}
				</>
			)}
			<ScalingHistory owner={{ kind: "application", applicationId }} />
		</div>
	);
};
