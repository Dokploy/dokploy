import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
	AutoscalingCard,
	autoscalingReason,
	cpuCapacityOf,
	useAutoscaling,
} from "@/components/dashboard/application/scaling/autoscaling-card";
import { CapacityCard } from "@/components/dashboard/application/scaling/capacity-card";
import { ManualScaleControl } from "@/components/dashboard/application/scaling/manual-scale-control";
import { MetricsCard } from "@/components/dashboard/application/scaling/metrics-card";
import { PlacementCard } from "@/components/dashboard/application/scaling/placement-card";
import { ReplicaDistribution } from "@/components/dashboard/application/scaling/replica-distribution";
import { ReplicasTable } from "@/components/dashboard/application/scaling/replicas-table";
import { ScalingHistory } from "@/components/dashboard/application/scaling/scaling-history";
import { StatTile } from "@/components/dashboard/application/scaling/show-scaling";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { ComposeBlueGreenCard } from "./blue-green-card";
import { SwitchToStackCard } from "./switch-to-stack-card";

type ComposeScaling = RouterOutputs["scaling"]["composeStatus"];
type ServiceStatus = ComposeScaling["services"][number];

const MODE_LABELS: Record<ServiceStatus["mode"], string> = {
	replicated: "Replicated",
	global: "Global",
	"replicated-job": "Job",
	"global-job": "Global job",
};

interface StateBadge {
	label: string;
	variant: "green" | "blue" | "red" | "blank";
}

const serviceState = (service: ServiceStatus): StateBadge => {
	if (!service.deployed) return { label: "Not deployed", variant: "blank" };
	if (service.stopped) return { label: "Stopped", variant: "blank" };
	if (service.counts.failedRecent > 0) {
		return { label: "Failing", variant: "red" };
	}
	if (service.desired !== null && service.counts.ready < service.desired) {
		return { label: "Starting", variant: "blue" };
	}
	return { label: "Ready", variant: "green" };
};

const ComposeNotices = ({ status }: { status: ComposeScaling }) => (
	<>
		{status.customCommand && (
			<AlertBlock type="info">
				This compose deploys with a custom command, so Dokploy cannot tell which
				files and project it uses and does not scale it. Set replicas in the
				compose file instead.
			</AlertBlock>
		)}
		{status.composeStatus === "error" && (
			<AlertBlock type="warning">
				The last deployment failed, so what runs may not match the compose file.
				Check the Deployments tab. A new replica count is saved and applied on
				the next deploy.
			</AlertBlock>
		)}
		{status.composeStatus === "running" && (
			<AlertBlock type="info">
				A deployment is in progress. Scaling is available again once it
				finishes.
			</AlertBlock>
		)}
		{status.composeType === "docker-compose" && (
			<AlertBlock type="info">
				Docker Compose runs every replica on this server. To spread replicas
				across several machines, deploy the compose as a Stack.
			</AlertBlock>
		)}
		{status.composeType === "docker-compose" &&
			!status.snapshot &&
			!status.customCommand && (
				<AlertBlock type="info">
					Deploy this compose once so Dokploy can scale its services live. Until
					then, a new count is saved and used on the next deploy.
				</AlertBlock>
			)}
	</>
);

const ServiceNotices = ({
	service,
	swarm,
}: {
	service: ServiceStatus;
	swarm: boolean;
}) => (
	<>
		{!service.deployed && (
			<AlertBlock type="info">
				This service is not running. The replica count you set here is used on
				the next {swarm ? "deploy" : "start or deploy"}.
			</AlertBlock>
		)}
		{service.stopped && (
			<AlertBlock type="info">
				This service is stopped. A new count is saved and applied when it runs
				again.
			</AlertBlock>
		)}
		{service.deployed && !service.inSync && (
			<AlertBlock type="warning">
				{service.desired} replica(s) are running but Dokploy is configured for{" "}
				{service.configured}. The configured count is applied on the next
				deploy, or apply it now below.
			</AlertBlock>
		)}
		{service.overrideNotApplied && (
			<AlertBlock type="warning">{service.overrideNotApplied}</AlertBlock>
		)}
		{service.singleInstanceReasons.length > 0 && (
			<AlertBlock type="info">
				This service can run only one container.{" "}
				{service.singleInstanceReasons.join(" ")}
			</AlertBlock>
		)}
		{service.rolloutInProgress && (
			<AlertBlock type="info">
				Rollout {service.updateStatus?.state}
				{service.updateStatus?.message
					? `: ${service.updateStatus.message}`
					: ""}
			</AlertBlock>
		)}
		{service.pendingReasons.map((reason) => (
			<AlertBlock key={reason} type="warning">
				Swarm cannot place some replicas: {reason}
			</AlertBlock>
		))}
		{service.deployed && !service.healthCheck && (
			<AlertBlock type="info">
				No health check is defined for this service, so a replica counts as
				ready as soon as its container runs, unless the image defines its own
				HEALTHCHECK. Add a healthcheck in the compose file so traffic only
				reaches replicas that can serve it.
			</AlertBlock>
		)}
	</>
);

const ServicesTable = ({
	services,
	selected,
	onSelect,
}: {
	services: ServiceStatus[];
	selected: string | null;
	onSelect: (serviceName: string) => void;
}) => (
	<div className="rounded-md border">
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Service</TableHead>
					<TableHead>Mode</TableHead>
					<TableHead>Ready / desired</TableHead>
					<TableHead>State</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{services.length === 0 && (
					<TableRow>
						<TableCell
							colSpan={4}
							className="py-6 text-center text-sm text-muted-foreground"
						>
							No services found. Deploy the compose to see its services here.
						</TableCell>
					</TableRow>
				)}
				{services.map((service) => {
					const state = serviceState(service);
					const isSelected = service.serviceName === selected;
					return (
						<TableRow
							key={service.serviceName}
							data-state={isSelected ? "selected" : undefined}
							className="cursor-pointer"
							onClick={() => onSelect(service.serviceName)}
						>
							<TableCell>
								<button
									type="button"
									className="font-mono text-sm underline-offset-4 hover:underline"
									aria-pressed={isSelected}
									onClick={(event) => {
										event.stopPropagation();
										onSelect(service.serviceName);
									}}
								>
									{service.serviceName}
								</button>
							</TableCell>
							<TableCell className="text-sm">
								{MODE_LABELS[service.mode]}
							</TableCell>
							<TableCell className="font-mono text-sm tabular-nums">
								{service.counts.ready} / {service.desired ?? "—"}
							</TableCell>
							<TableCell>
								<Badge variant={state.variant}>{state.label}</Badge>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	</div>
);

const ServiceDetail = ({
	composeId,
	service,
	swarm,
	canScale,
	autoscalingOn,
}: {
	composeId: string;
	service: ServiceStatus;
	swarm: boolean;
	canScale: boolean;
	autoscalingOn: string | null;
}) => (
	<div className="flex flex-col gap-4">
		<h3 className="text-base font-medium">
			Service <span className="font-mono">{service.serviceName}</span>
		</h3>
		<div className="grid gap-4 grid-cols-2 md:grid-cols-4">
			<StatTile
				label="Desired"
				value={service.desired ?? "—"}
				hint={service.inSync ? undefined : `Configured: ${service.configured}`}
			/>
			<StatTile
				label="Ready"
				value={service.counts.ready}
				hint="Receiving traffic"
			/>
			<StatTile
				label="Starting / pending"
				value={service.counts.starting + service.counts.pending}
			/>
			<StatTile
				label="Failed"
				value={service.counts.failedRecent}
				hint={swarm ? "Last 15 minutes" : "Unhealthy or exited with an error"}
			/>
		</div>
		<ServiceNotices service={service} swarm={swarm} />
		{canScale && (
			<ManualScaleControl
				key={service.serviceName}
				target={{
					kind: "compose",
					composeId,
					serviceName: service.serviceName,
					engine: swarm ? "swarm" : "compose",
				}}
				configured={service.configured}
				running={service.desired}
				disabledReason={autoscalingOn ?? service.disabledReason}
				maxReplicas={service.singleInstanceReasons.length > 0 ? 1 : undefined}
			/>
		)}
		{swarm && <ReplicaDistribution distribution={service.distribution} />}
		<ReplicasTable
			status={service}
			unplacedLabel={swarm ? "Unassigned" : "This server"}
		/>
	</div>
);

export const ShowComposeScaling = ({ composeId }: { composeId: string }) => {
	const { data: permissions } = api.user.getPermissions.useQuery();
	const {
		data: status,
		error,
		isLoading,
		isFetching,
		refetch,
	} = api.scaling.composeStatus.useQuery(
		{ composeId },
		{ refetchInterval: 5000 },
	);
	const [selected, setSelected] = useState<string | null>(null);
	const services = status?.services ?? [];
	const service =
		services.find((candidate) => candidate.serviceName === selected) ?? null;
	const swarm = status?.composeType === "stack";

	// Keep the chosen service across polls; pick the first replicated one
	// when nothing is chosen yet or the chosen one disappeared.
	useEffect(() => {
		if (services.length === 0) return;
		if (services.some((candidate) => candidate.serviceName === selected)) {
			return;
		}
		const first =
			services.find((candidate) => candidate.mode === "replicated") ??
			services[0];
		setSelected(first?.serviceName ?? null);
	}, [services, selected]);

	const canConfigure = !!permissions?.service.create;
	const scaleTarget = {
		kind: "compose" as const,
		composeId,
		serviceName: service?.serviceName ?? "",
		engine: swarm ? ("swarm" as const) : ("compose" as const),
	};
	const { data: autoscaling } = useAutoscaling(scaleTarget, !!service);
	const { data: placementNodes } = api.scaling.composePlacementNodes.useQuery(
		{ composeId },
		{ enabled: swarm && canConfigure && !!permissions?.docker.read },
	);
	const capacityQuery = api.scaling.composeCapacity.useQuery(
		{
			composeId,
			serviceName: service?.serviceName ?? "",
			replicas: Math.max(1, service?.configured ?? 1),
		},
		{ enabled: swarm && !!service, refetchInterval: 15000 },
	);

	return (
		<div className="flex flex-col gap-4">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-start justify-between gap-4">
					<div>
						<CardTitle className="text-xl">Replicas</CardTitle>
						<CardDescription>
							Run several copies of a service. Traffic from a service's domains
							is spread across its replicas that are ready.
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
							<ComposeNotices status={status} />
							<ServicesTable
								services={services}
								selected={selected}
								onSelect={setSelected}
							/>
							{service && (
								<ServiceDetail
									composeId={composeId}
									service={service}
									swarm={swarm}
									canScale={!!permissions?.deployment.create}
									autoscalingOn={autoscalingReason(autoscaling)}
								/>
							)}
						</>
					)}
				</CardContent>
			</Card>
			{service && (
				<AutoscalingCard
					key={`autoscaling-${service.serviceName}`}
					target={scaleTarget}
					canConfigure={canConfigure && !!permissions?.deployment.create}
					currentReplicas={service.desired ?? service.configured}
					cpuCapacity={swarm ? cpuCapacityOf(capacityQuery.data) : null}
				/>
			)}
			{service && permissions?.monitoring.read && (
				<MetricsCard
					key={service.serviceName}
					target={{
						kind: "compose",
						composeId,
						serviceName: service.serviceName,
						engine: swarm ? "swarm" : "compose",
					}}
					canInstall={!!permissions?.server.create}
				/>
			)}
			{swarm && service && (
				<CapacityCard
					capacity={capacityQuery.data}
					error={capacityQuery.error?.message ?? null}
				/>
			)}
			{swarm && service?.placement && canConfigure && (
				<PlacementCard
					key={service.serviceName}
					target={{
						kind: "compose",
						composeId,
						serviceName: service.serviceName,
					}}
					placement={service.placement}
					nodes={placementNodes ?? []}
				/>
			)}
			{swarm && canConfigure && !status?.customCommand && (
				<ComposeBlueGreenCard composeId={composeId} />
			)}
			{status?.composeType === "docker-compose" && !status.customCommand && (
				<SwitchToStackCard
					composeId={composeId}
					canSwitch={canConfigure && !!permissions?.deployment.create}
				/>
			)}
			<ScalingHistory owner={{ kind: "compose", composeId }} />
		</div>
	);
};
