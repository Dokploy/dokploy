import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { type Control, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, type RouterOutputs } from "@/utils/api";
import { readableErrorMessage } from "@/utils/error-message";
import { wholeNumber } from "./format";
import type { ScaleTarget } from "./scale-target";

type Autoscaling = RouterOutputs["scaling"]["autoscaling"];
type Decision = NonNullable<Autoscaling["lastDecision"]>;

const schema = z
	.object({
		enabled: z.boolean(),
		minReplicas: wholeNumber(1, 100),
		maxReplicas: wholeNumber(1, 100),
		useCpu: z.boolean(),
		cpuTargetPercent: wholeNumber(5, 100),
		useMemory: z.boolean(),
		memoryTargetPercent: wholeNumber(5, 100),
		tolerancePercent: wholeNumber(0, 50),
		evaluationIntervalSeconds: wholeNumber(15, 600),
		scaleUpWindowSeconds: wholeNumber(0, 3600),
		scaleDownWindowSeconds: wholeNumber(0, 7200),
		cooldownSeconds: wholeNumber(0, 3600),
		maxScaleUpStep: wholeNumber(1, 100),
		maxScaleDownStep: wholeNumber(1, 100),
	})
	.refine((value) => value.minReplicas <= value.maxReplicas, {
		message: "Cannot be above the maximum",
		path: ["minReplicas"],
	})
	.refine((value) => value.useCpu || value.useMemory, {
		message: "Scale on CPU, memory or both",
		path: ["useCpu"],
	});

type FormValues = z.infer<typeof schema>;

const toForm = (settings: Autoscaling["settings"]): FormValues => ({
	...settings,
	useCpu: settings.cpuTargetPercent !== null,
	cpuTargetPercent: settings.cpuTargetPercent ?? 70,
	useMemory: settings.memoryTargetPercent !== null,
	memoryTargetPercent: settings.memoryTargetPercent ?? 80,
});

const toAutoscalingTarget = (target: ScaleTarget) =>
	target.kind === "application"
		? { kind: "application" as const, applicationId: target.applicationId }
		: {
				kind: "compose" as const,
				composeId: target.composeId,
				serviceName: target.serviceName,
			};

export const useAutoscaling = (target: ScaleTarget, enabled = true) =>
	api.scaling.autoscaling.useQuery(
		{ target: toAutoscalingTarget(target) },
		{ refetchInterval: 10000, enabled },
	);

/** Why the manual control is off while autoscaling manages the count. */
export const autoscalingReason = (
	autoscaling:
		| {
				settings: {
					enabled: boolean;
					minReplicas: number;
					maxReplicas: number;
				};
		  }
		| undefined,
) =>
	autoscaling?.settings.enabled
		? `Autoscaling sets the count between ${autoscaling.settings.minReplicas} and ${autoscaling.settings.maxReplicas}. Change those in Autoscaling, or turn it off to scale by hand.`
		: null;

const ACTION_LABELS: Record<
	Decision["action"],
	{ label: string; variant: "default" | "secondary" | "yellow" | "red" }
> = {
	scale_up: { label: "Scaled up", variant: "default" },
	scale_down: { label: "Scaled down", variant: "default" },
	hold: { label: "Holding", variant: "secondary" },
	error: { label: "Error", variant: "red" },
};

const percentOrDash = (value: number | null) =>
	value === null ? "—" : `${Math.round(value)}%`;

const NumberField = ({
	control,
	name,
	label,
	description,
	suffix,
	disabled,
}: {
	control: Control<FormValues>;
	name: keyof FormValues;
	label: string;
	description?: string;
	suffix?: string;
	disabled?: boolean;
}) => (
	<FormField
		control={control}
		name={name}
		render={({ field }) => (
			<FormItem>
				<FormLabel>{label}</FormLabel>
				<div className="flex items-center gap-2">
					<FormControl>
						<Input
							type="number"
							inputMode="numeric"
							className="w-28"
							disabled={disabled}
							name={field.name}
							onBlur={field.onBlur}
							ref={field.ref}
							value={
								typeof field.value === "number" && !Number.isNaN(field.value)
									? field.value
									: ""
							}
							onChange={(event) => field.onChange(event.target.valueAsNumber)}
						/>
					</FormControl>
					{suffix && (
						<span className="text-sm text-muted-foreground">{suffix}</span>
					)}
				</div>
				{description && <FormDescription>{description}</FormDescription>}
				<FormMessage />
			</FormItem>
		)}
	/>
);

const TargetField = ({
	control,
	toggle,
	name,
	label,
	description,
	enabled,
	disabled,
}: {
	control: Control<FormValues>;
	toggle: "useCpu" | "useMemory";
	name: "cpuTargetPercent" | "memoryTargetPercent";
	label: string;
	description?: string;
	enabled: boolean;
	disabled: boolean;
}) => (
	<div className="flex flex-col gap-2 rounded-lg border p-3">
		<FormField
			control={control}
			name={toggle}
			render={({ field }) => (
				<FormItem className="flex flex-row items-center justify-between gap-4">
					<FormLabel>Scale on {label}</FormLabel>
					<FormControl>
						<Switch
							checked={field.value}
							onCheckedChange={field.onChange}
							disabled={disabled}
						/>
					</FormControl>
				</FormItem>
			)}
		/>
		<NumberField
			control={control}
			name={name}
			label="Target per replica"
			description={description}
			suffix="%"
			disabled={disabled || !enabled}
		/>
	</div>
);

/** How much CPU the replicas may use, against what their nodes have. */
export interface CpuCapacity {
	/** NanoCPUs one replica may use. */
	limit: number;
	/** NanoCPUs of the nodes the service can run on, together. */
	total: number;
}

export const cpuCapacityOf = (
	capacity:
		| {
				requirements: { cpuLimit: number };
				eligibleCpu: number;
				unknownNodes: number;
		  }
		| undefined,
): CpuCapacity | null =>
	capacity && capacity.unknownNodes === 0
		? { limit: capacity.requirements.cpuLimit, total: capacity.eligibleCpu }
		: null;

const cpus = (nanoCpus: number) => {
	const value = Math.round(nanoCpus / 1e7) / 100;
	return `${value} CPU${value === 1 ? "" : "s"}`;
};

// Limits are not reservations, so Swarm places replicas past what the nodes
// can run at their limits; those replicas only share the same CPUs.
const cpuCeilingWarning = (
	capacity: CpuCapacity | null,
	maxReplicas: number,
) => {
	if (!capacity?.limit || !capacity.total) return null;
	const fit = Math.max(1, Math.floor(capacity.total / capacity.limit));
	if (!(maxReplicas > fit)) return null;
	return `At ${maxReplicas} replicas their CPU limits add up to ${cpus(maxReplicas * capacity.limit)}, but the nodes this service can run on have ${cpus(capacity.total)} in all, shared with everything else on them. Replicas past ${fit} share those CPUs rather than add capacity. Lower the maximum or the CPU limit, or add nodes.`;
};

const LastDecision = ({
	autoscaling,
	settings,
}: {
	autoscaling: Autoscaling;
	settings: Autoscaling["settings"];
}) => {
	const decision = autoscaling.lastDecision;
	if (!decision) {
		return (
			<p className="text-sm text-muted-foreground">
				No evaluation yet. The first one runs within{" "}
				{settings.evaluationIntervalSeconds} seconds.
			</p>
		);
	}
	const action = ACTION_LABELS[decision.action];
	return (
		<div className="flex flex-col gap-3 rounded-lg border p-4">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<Badge variant={action.variant}>{action.label}</Badge>
				<span className="text-muted-foreground">
					Last evaluated <DateTooltip date={decision.at} />
				</span>
				{autoscaling.lastScaledAt && (
					<span className="text-muted-foreground">
						· last change <DateTooltip date={autoscaling.lastScaledAt} />
					</span>
				)}
			</div>
			<p className="text-sm">{decision.reason}</p>
			<div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
				<div>
					<div className="text-muted-foreground">Replicas</div>
					<div className="font-medium tabular-nums">
						{decision.current ?? "—"}
						{decision.target !== null && decision.target !== decision.current
							? ` → ${decision.target}`
							: ""}
					</div>
				</div>
				<div>
					<div className="text-muted-foreground">CPU</div>
					<div className="font-medium tabular-nums">
						{percentOrDash(decision.cpuPercent)}
						{settings.cpuTargetPercent !== null &&
							` / ${settings.cpuTargetPercent}%`}
					</div>
				</div>
				<div>
					<div className="text-muted-foreground">Memory</div>
					<div className="font-medium tabular-nums">
						{percentOrDash(decision.memoryPercent)}
						{settings.memoryTargetPercent !== null &&
							` / ${settings.memoryTargetPercent}%`}
					</div>
				</div>
				<div>
					<div className="text-muted-foreground">Replicas reporting</div>
					<div className="font-medium tabular-nums">
						{decision.coverage
							? `${decision.coverage.fresh} / ${decision.coverage.ready}`
							: "—"}
					</div>
				</div>
			</div>
		</div>
	);
};

export const AutoscalingCard = ({
	target,
	canConfigure,
	currentReplicas,
	cpuCapacity = null,
}: {
	target: ScaleTarget;
	canConfigure: boolean;
	currentReplicas: number | null;
	cpuCapacity?: CpuCapacity | null;
}) => {
	const utils = api.useUtils();
	const { data: autoscaling, error } = useAutoscaling(target);
	const { mutateAsync, isPending } =
		api.scaling.updateAutoscaling.useMutation();
	const [advanced, setAdvanced] = useState(false);
	const form = useForm<FormValues>({
		defaultValues: autoscaling ? toForm(autoscaling.settings) : undefined,
		resolver: zodResolver(schema),
	});

	const saved = autoscaling ? JSON.stringify(autoscaling.settings) : null;
	// A first policy starts from the count the service runs today.
	const prefill =
		autoscaling && !autoscaling.saved && currentReplicas && currentReplicas > 1
			? currentReplicas
			: null;
	useEffect(() => {
		if (!saved) return;
		const values = toForm(JSON.parse(saved) as Autoscaling["settings"]);
		if (prefill) {
			values.minReplicas = prefill;
			values.maxReplicas = Math.max(values.maxReplicas, prefill * 2);
		}
		form.reset(values);
	}, [form, saved, prefill]);

	if (error) {
		return (
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">Autoscaling</CardTitle>
				</CardHeader>
				<CardContent>
					<AlertBlock type="error">{error.message}</AlertBlock>
				</CardContent>
			</Card>
		);
	}
	if (!autoscaling) return null;

	const { settings, controller } = autoscaling;
	const values = form.watch();
	const disabled = !canConfigure || !autoscaling.available;
	const outside =
		values.enabled &&
		currentReplicas !== null &&
		(currentReplicas < values.minReplicas ||
			currentReplicas > values.maxReplicas);
	const oneServer = target.kind === "compose" && target.engine === "compose";
	const cpuCeiling = values.enabled
		? cpuCeilingWarning(cpuCapacity, values.maxReplicas)
		: null;

	const onSubmit = async (form: FormValues) => {
		await mutateAsync({
			target: toAutoscalingTarget(target),
			settings: {
				enabled: form.enabled,
				minReplicas: form.minReplicas,
				maxReplicas: form.maxReplicas,
				cpuTargetPercent: form.useCpu ? form.cpuTargetPercent : null,
				memoryTargetPercent: form.useMemory ? form.memoryTargetPercent : null,
				tolerancePercent: form.tolerancePercent,
				evaluationIntervalSeconds: form.evaluationIntervalSeconds,
				scaleUpWindowSeconds: form.scaleUpWindowSeconds,
				scaleDownWindowSeconds: form.scaleDownWindowSeconds,
				cooldownSeconds: form.cooldownSeconds,
				maxScaleUpStep: form.maxScaleUpStep,
				maxScaleDownStep: form.maxScaleDownStep,
			},
		})
			.then(() => toast.success("Autoscaling saved"))
			.catch((error) =>
				toast.error(readableErrorMessage(error, "Error saving autoscaling")),
			);
		await utils.scaling.autoscaling.invalidate();
		if (target.kind === "application") {
			await utils.scaling.events.invalidate({
				applicationId: target.applicationId,
			});
		} else {
			await utils.scaling.composeEvents.invalidate({
				composeId: target.composeId,
			});
		}
	};

	return (
		<Card className="bg-background">
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div>
					<CardTitle className="text-xl">Autoscaling</CardTitle>
					<CardDescription>
						Adds and removes replicas to keep CPU or memory per replica near a
						target, measured against each replica's reservation (or its limit)
						by the metrics agent.
						{oneServer && " Docker Compose replicas stay on this server."}
					</CardDescription>
				</div>
				<Badge variant={settings.enabled ? "default" : "secondary"}>
					{settings.enabled ? "On" : "Off"}
				</Badge>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{!autoscaling.available && (
					<AlertBlock type="info">
						Autoscaling is not available on Dokploy Cloud.
					</AlertBlock>
				)}
				{settings.enabled && !controller.running && (
					<AlertBlock type="warning">
						The autoscaler is not running, so nothing is being evaluated.
						{controller.heartbeatAt
							? " It last reported in "
							: " It has never reported. "}
						{controller.heartbeatAt && (
							<DateTooltip date={controller.heartbeatAt} />
						)}
						{controller.heartbeatAt && ". "}
						It runs as the dokploy-autoscaler service on the Dokploy host; check
						it with docker service ps dokploy-autoscaler.
					</AlertBlock>
				)}
				{settings.enabled && (
					<LastDecision autoscaling={autoscaling} settings={settings} />
				)}

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="flex flex-col gap-4"
					>
						<FormField
							control={form.control}
							name="enabled"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Autoscale this service</FormLabel>
										<FormDescription>
											While on, the replica count is set by the autoscaler
											within the minimum and maximum, and the manual control is
											turned off.
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
											disabled={disabled}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
						<div className="grid gap-4 md:grid-cols-2">
							<NumberField
								control={form.control}
								name="minReplicas"
								label="Minimum replicas"
								disabled={disabled}
							/>
							<NumberField
								control={form.control}
								name="maxReplicas"
								label="Maximum replicas"
								disabled={disabled}
							/>
							<TargetField
								control={form.control}
								toggle="useCpu"
								name="cpuTargetPercent"
								label="CPU"
								enabled={values.useCpu}
								disabled={disabled}
							/>
							<TargetField
								control={form.control}
								toggle="useMemory"
								name="memoryTargetPercent"
								label="memory"
								description={
									values.useCpu && values.useMemory
										? "Adds replicas above the target and keeps them near it. Below it, CPU decides when to remove them: most of the memory a replica holds when idle stays with it whatever the load."
										: undefined
								}
								enabled={values.useMemory}
								disabled={disabled}
							/>
						</div>
						{form.formState.errors.useCpu && (
							<p className="text-sm text-red-600 dark:text-red-400">
								{form.formState.errors.useCpu.message}
							</p>
						)}
						{outside && (
							<AlertBlock type="info">
								It runs {currentReplicas} replicas now, so saving scales it to{" "}
								{currentReplicas !== null &&
								currentReplicas < values.minReplicas
									? values.minReplicas
									: values.maxReplicas}{" "}
								right away.
							</AlertBlock>
						)}
						{cpuCeiling && <AlertBlock type="warning">{cpuCeiling}</AlertBlock>}

						<Button
							type="button"
							variant="ghost"
							className="w-fit gap-1 px-0"
							onClick={() => setAdvanced((open) => !open)}
						>
							<ChevronDown
								className={advanced ? "size-4 rotate-180" : "size-4"}
							/>
							Timing and steps
						</Button>
						{advanced && (
							<div className="grid gap-4 md:grid-cols-2">
								<NumberField
									control={form.control}
									name="evaluationIntervalSeconds"
									label="Evaluate every"
									suffix="seconds"
									disabled={disabled}
								/>
								<NumberField
									control={form.control}
									name="tolerancePercent"
									label="Tolerance"
									suffix="% of the target"
									description="Usage this close to the target changes nothing."
									disabled={disabled}
								/>
								<NumberField
									control={form.control}
									name="scaleUpWindowSeconds"
									label="Scale up after"
									suffix="seconds above target"
									disabled={disabled}
								/>
								<NumberField
									control={form.control}
									name="scaleDownWindowSeconds"
									label="Scale down after"
									suffix="seconds below target"
									disabled={disabled}
								/>
								<NumberField
									control={form.control}
									name="cooldownSeconds"
									label="Wait after a change"
									suffix="seconds"
									disabled={disabled}
								/>
								<div className="grid grid-cols-2 gap-4">
									<NumberField
										control={form.control}
										name="maxScaleUpStep"
										label="Add at most"
										suffix="per step"
										disabled={disabled}
									/>
									<NumberField
										control={form.control}
										name="maxScaleDownStep"
										label="Remove at most"
										suffix="per step"
										disabled={disabled}
									/>
								</div>
							</div>
						)}

						{canConfigure ? (
							<Button
								type="submit"
								className="w-fit"
								isLoading={isPending}
								disabled={!autoscaling.available}
							>
								Save autoscaling
							</Button>
						) : (
							<p className="text-sm text-muted-foreground">
								Changing autoscaling needs permission to edit and deploy this
								service.
							</p>
						)}
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
