import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";

interface Props {
	applicationId: string;
}

type DeploymentStrategy = "standard" | "zero-downtime";

type UpdateConfigSwarm = {
	Parallelism?: number;
	Delay?: number;
	FailureAction?: string;
	Monitor?: number;
	MaxFailureRatio?: number;
	Order?: string;
} | null;

const getDeploymentStrategy = (
	updateConfigSwarm: UpdateConfigSwarm | undefined,
): DeploymentStrategy =>
	updateConfigSwarm?.Order === "stop-first" ? "standard" : "zero-downtime";

const getEffectiveInstances = (
	replicas?: number,
	modeSwarm?: {
		Replicated?: { Replicas?: number };
	} | null,
) => modeSwarm?.Replicated?.Replicas ?? replicas ?? 1;

const buildUpdateConfigSwarm = (
	currentUpdateConfigSwarm: UpdateConfigSwarm | undefined,
	strategy: DeploymentStrategy,
) => {
	const baseConfig = currentUpdateConfigSwarm ?? {
		FailureAction: "rollback",
		Parallelism: 1,
	};

	return {
		...baseConfig,
		Parallelism: currentUpdateConfigSwarm?.Parallelism ?? 1,
		Order: strategy === "standard" ? "stop-first" : "start-first",
	};
};

export const ShowScalingAndRollouts = ({ applicationId }: Props) => {
	const { data: permissions } = api.user.getPermissions.useQuery();
	const canUpdateService = permissions?.service.create ?? false;
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{ enabled: !!applicationId },
	);
	const { mutateAsync: update } = api.application.update.useMutation();
	const [instances, setInstances] = useState(1);
	const [strategy, setStrategy] = useState<DeploymentStrategy>("zero-downtime");
	const [isSaving, setIsSaving] = useState(false);

	const effectiveInstances = getEffectiveInstances(
		data?.replicas,
		data?.modeSwarm,
	);
	const currentStrategy = getDeploymentStrategy(data?.updateConfigSwarm);
	const hasHealthCheck = Boolean(data?.healthCheckSwarm);
	const hasHostPublishedPorts =
		(data?.ports?.some((port) => port.publishMode === "host") ||
			data?.endpointSpecSwarm?.Ports?.some(
				(port) => port.PublishMode === "host",
			)) ??
		false;
	const hasCustomServiceMode = Boolean(
		data?.modeSwarm?.Global ||
			data?.modeSwarm?.ReplicatedJob ||
			data?.modeSwarm?.GlobalJob,
	);
	const hasReplicatedModeOverride = Boolean(data?.modeSwarm?.Replicated);
	const hasScalingOverride = hasCustomServiceMode || hasReplicatedModeOverride;
	const isDirty =
		instances !== effectiveInstances || strategy !== currentStrategy;

	useEffect(() => {
		setInstances(effectiveInstances);
		setStrategy(currentStrategy);
	}, [effectiveInstances, currentStrategy]);

	const onSave = async () => {
		if (instances < 1) {
			toast.error("Instances must be at least 1");
			return;
		}

		setIsSaving(true);
		try {
			await update({
				applicationId,
				replicas: instances,
				modeSwarm: null,
				updateConfigSwarm: buildUpdateConfigSwarm(
					data?.updateConfigSwarm,
					strategy,
				),
			});
			toast.success("Scaling and rollout settings updated. Redeploy to apply.");
			await refetch();
		} catch {
			toast.error("Error updating scaling and rollout settings");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Scaling & Rollouts</CardTitle>
				<CardDescription>
					Control application instances and whether deploys replace containers
					before or after the new task starts.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="application-instances">Instances</Label>
						<Input
							id="application-instances"
							type="number"
							min={1}
							value={instances}
							disabled={!canUpdateService}
							onChange={(event) => {
								const nextValue = Number(event.target.value);
								setInstances(
									Number.isNaN(nextValue) ? 1 : Math.max(1, nextValue),
								);
							}}
						/>
						<p className="text-sm text-muted-foreground">
							Uses simple replicated scaling for this application.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="application-deployment-strategy">
							Deployment Strategy
						</Label>
						<Select
							value={strategy}
							disabled={!canUpdateService}
							onValueChange={(value) =>
								setStrategy(value as DeploymentStrategy)
							}
						>
							<SelectTrigger id="application-deployment-strategy">
								<SelectValue placeholder="Select a deployment strategy" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="standard">Standard</SelectItem>
								<SelectItem value="zero-downtime">Zero Downtime</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-sm text-muted-foreground">
							{strategy === "zero-downtime"
								? "Starts the replacement task first. Best results require a health check."
								: "Stops the current task before the replacement starts."}
						</p>
					</div>
				</div>

				{strategy === "zero-downtime" && !hasHealthCheck && (
					<AlertBlock type="warning">
						Zero downtime is best-effort without a health check. Configure one
						in Advanced - Cluster Settings - Swarm Settings so Swarm knows when
						the new task is actually ready.
					</AlertBlock>
				)}

				{strategy === "zero-downtime" && hasHostPublishedPorts && (
					<AlertBlock type="warning">
						This application exposes one or more ports in <code>host</code>{" "}
						mode. Start-first rollouts can still hit port-binding conflicts on a
						node, so domain-routed traffic through Traefik is the safer path.
					</AlertBlock>
				)}

				{hasScalingOverride && (
					<AlertBlock type="info">
						This app has custom swarm service mode settings. Saving here will
						switch it back to simple replicated scaling and use the Instances
						value above.
					</AlertBlock>
				)}

				<AlertBlock type="info">
					Custom health checks, delays, rollback behavior, and other raw swarm
					settings still live under Advanced - Cluster Settings.
				</AlertBlock>

				<div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
					<div className="space-y-1">
						<p className="text-sm font-medium">Current effective settings</p>
						<p className="text-sm text-muted-foreground">
							{effectiveInstances} instance
							{effectiveInstances === 1 ? "" : "s"} with{" "}
							{currentStrategy === "zero-downtime"
								? "start-first"
								: "stop-first"}{" "}
							rollouts.
						</p>
						<p className="text-sm text-muted-foreground">
							Save changes here, then redeploy the application to apply them.
						</p>
					</div>
					{canUpdateService && (
						<Button
							type="button"
							onClick={onSave}
							isLoading={isSaving}
							disabled={!isDirty || isSaving}
						>
							Save Rollout Settings
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
