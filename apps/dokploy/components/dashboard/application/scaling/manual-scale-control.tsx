import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";
import { readableErrorMessage } from "@/utils/error-message";
import { type ScaleTarget, usesSwarm } from "./scale-target";

// Mirrors MAX_SERVICE_REPLICAS; the server schema is not bundled for the
// browser and enforces the limit itself.
const MAX_REPLICAS = 100;

interface Props {
	target: ScaleTarget;
	configured: number;
	running: number | null;
	disabledReason: string | null;
	/** Lower than the global limit for services that can run one container. */
	maxReplicas?: number;
}

export const ManualScaleControl = ({
	target: scaleTarget,
	configured,
	running,
	disabledReason,
	maxReplicas = MAX_REPLICAS,
}: Props) => {
	const clamp = (value: number) =>
		Math.min(maxReplicas, Math.max(1, Math.round(value)));
	const utils = api.useUtils();
	const [target, setTarget] = useState(configured);
	const applicationScale = api.scaling.setReplicas.useMutation();
	const composeScale = api.scaling.setComposeReplicas.useMutation();
	const isPending = applicationScale.isPending || composeScale.isPending;
	const swarm = usesSwarm(scaleTarget);

	// Keyed on the saved value only: the tab polls status and a reset on every
	// poll would discard the number being edited.
	useEffect(() => {
		setTarget(configured);
	}, [configured]);

	const current = running && running > 0 ? running : configured;
	const disabled = !!disabledReason || isPending;
	const unchanged = target === configured && target === current;
	const direction =
		target > current ? "up" : target < current ? "down" : "same";

	// The server checks any count above what is running, including a stopped
	// or undeployed service that starts with the saved count later.
	const exceedsRunning = target > (running ?? 0);
	const checkCapacity = exceedsRunning && !unchanged && !disabled;
	const applicationCapacity = api.scaling.capacity.useQuery(
		{
			applicationId:
				scaleTarget.kind === "application" ? scaleTarget.applicationId : "",
			replicas: target,
		},
		{ enabled: checkCapacity && scaleTarget.kind === "application" },
	);
	// Docker reserves nothing for plain Compose containers, so only Swarm
	// services get an estimate.
	const stackCapacity = api.scaling.composeCapacity.useQuery(
		{
			composeId: scaleTarget.kind === "compose" ? scaleTarget.composeId : "",
			serviceName:
				scaleTarget.kind === "compose" ? scaleTarget.serviceName : "",
			replicas: target,
		},
		{
			enabled: checkCapacity && scaleTarget.kind === "compose" && swarm,
		},
	);
	const capacityQuery =
		scaleTarget.kind === "application" ? applicationCapacity : stackCapacity;
	const capacity = exceedsRunning && swarm ? capacityQuery.data : undefined;
	const capacityWarnings =
		capacity?.warnings.filter(
			(warning) =>
				warning.severity === "warning" || warning.code === "capacity_unknown",
		) ?? [];
	// The warning is shown in the confirmation, so confirming acknowledges it.
	const acknowledgeWarnings = capacity?.fit === "insufficient";

	const apply = async () => {
		const request =
			scaleTarget.kind === "application"
				? applicationScale.mutateAsync({
						applicationId: scaleTarget.applicationId,
						replicas: target,
						acknowledgeWarnings,
					})
				: composeScale.mutateAsync({
						composeId: scaleTarget.composeId,
						serviceName: scaleTarget.serviceName,
						replicas: target,
						acknowledgeWarnings,
					});
		await request
			.then((result) => {
				if (result.applied) {
					toast.success(`Scaling from ${result.from} to ${result.to} replicas`);
				} else {
					toast.info(result.note ?? `Replica count set to ${result.to}`);
				}
			})
			.catch((error) => {
				toast.error(readableErrorMessage(error, "Error scaling"));
			});
		if (scaleTarget.kind === "application") {
			const { applicationId } = scaleTarget;
			await Promise.all([
				utils.scaling.status.invalidate({ applicationId }),
				utils.scaling.events.invalidate({ applicationId }),
				utils.scaling.capacity.invalidate({ applicationId }),
				utils.application.one.invalidate({ applicationId }),
			]);
		} else {
			const { composeId } = scaleTarget;
			await Promise.all([
				utils.scaling.composeStatus.invalidate({ composeId }),
				utils.scaling.composeEvents.invalidate({ composeId }),
				utils.scaling.composeCapacity.invalidate({ composeId }),
			]);
		}
	};

	const summary =
		direction === "down"
			? swarm
				? `Swarm will stop ${current - target} replica(s). Requests in flight on those replicas get the configured stop grace period to finish.`
				: `Docker Compose will stop and remove the ${current - target} highest-numbered container(s). Requests in flight on them get the stop grace period to finish.`
			: direction === "up"
				? swarm
					? `Swarm will start ${target - current} more replica(s) without restarting the running ones.`
					: `Docker Compose will start ${target - current} more container(s) on this server without restarting the running ones.`
				: `Saves ${target} as the configured count. The running replicas are not changed.`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor="replica-count">Replica count</Label>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label="Remove one replica"
					disabled={disabled || target <= 1}
					onClick={() => setTarget((value) => clamp(value - 1))}
				>
					<Minus className="size-4" />
				</Button>
				{/* Input wraps itself in a full-width div, which would push the
				    buttons onto their own lines. */}
				<div className="w-24">
					<Input
						id="replica-count"
						type="number"
						inputMode="numeric"
						min={1}
						max={maxReplicas}
						className="text-center"
						value={target}
						disabled={disabled}
						onChange={(event) => {
							const value = Number(event.target.value);
							if (!Number.isNaN(value)) setTarget(clamp(value));
						}}
					/>
				</div>
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label="Add one replica"
					disabled={disabled || target >= maxReplicas}
					onClick={() => setTarget((value) => clamp(value + 1))}
				>
					<Plus className="size-4" />
				</Button>
				<DialogAction
					title={
						direction === "same"
							? `Keep ${target} replicas?`
							: `Scale ${direction} to ${target} replicas?`
					}
					description={
						<>
							<span className="block">{summary}</span>
							{exceedsRunning && capacityQuery.isFetching && !capacity && (
								<span className="mt-2 block">Checking capacity…</span>
							)}
							{capacityWarnings.map((warning) => (
								<span
									key={warning.code}
									className="mt-2 block text-orange-600 dark:text-orange-400"
								>
									{warning.message}
								</span>
							))}
						</>
					}
					type={
						direction === "down" || acknowledgeWarnings
							? "destructive"
							: "default"
					}
					onClick={apply}
				>
					<Button
						type="button"
						disabled={disabled || unchanged}
						isLoading={isPending}
					>
						Apply
					</Button>
				</DialogAction>
				{!unchanged && !disabled && (
					<Button
						type="button"
						variant="ghost"
						onClick={() => setTarget(configured)}
					>
						Reset
					</Button>
				)}
			</div>
			{disabledReason && (
				<p className="text-sm text-muted-foreground">{disabledReason}</p>
			)}
		</div>
	);
};
