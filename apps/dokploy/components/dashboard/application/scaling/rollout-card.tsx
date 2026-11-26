import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api, type RouterOutputs } from "@/utils/api";
import { readableErrorMessage } from "@/utils/error-message";
import { wholeNumber } from "./format";

type Settings = RouterOutputs["scaling"]["settings"];

const rolloutSchema = z.object({
	strategy: z.enum(["start-first", "stop-first"]),
	batchSize: wholeNumber(0, 100),
	delaySeconds: wholeNumber(0, 3600),
	monitorSeconds: wholeNumber(1, 3600),
	failureAction: z.enum(["rollback", "pause", "continue"]),
	maxFailureRatioPercent: wholeNumber(0, 100),
});

type RolloutForm = z.infer<typeof rolloutSchema>;

const toForm = ({ isDefault: _, ...rollout }: Settings["rollout"]) => rollout;

const NumberField = ({
	form,
	name,
	label,
	description,
}: {
	form: ReturnType<typeof useForm<RolloutForm>>;
	name:
		| "batchSize"
		| "delaySeconds"
		| "monitorSeconds"
		| "maxFailureRatioPercent";
	label: string;
	description: string;
}) => (
	<FormField
		control={form.control}
		name={name}
		render={({ field }) => (
			<FormItem>
				<FormLabel>{label}</FormLabel>
				<FormControl>
					<Input
						type="number"
						inputMode="numeric"
						{...field}
						onChange={(event) => field.onChange(event.target.valueAsNumber)}
						value={Number.isNaN(field.value) ? "" : field.value}
					/>
				</FormControl>
				<FormDescription>{description}</FormDescription>
				<FormMessage />
			</FormItem>
		)}
	/>
);

export const RolloutCard = ({
	applicationId,
	settings,
}: {
	applicationId: string;
	settings: Settings;
}) => {
	const utils = api.useUtils();
	const { mutateAsync, isPending } = api.scaling.updateRollout.useMutation();
	const form = useForm<RolloutForm>({
		defaultValues: toForm(settings.rollout),
		resolver: zodResolver(rolloutSchema),
	});

	const saved = JSON.stringify(toForm(settings.rollout));
	// Reset only when the saved settings change, so a background refetch does
	// not discard unsaved edits.
	useEffect(() => {
		form.reset(JSON.parse(saved) as RolloutForm);
	}, [form, saved]);

	const strategy = form.watch("strategy");
	const batchSize = form.watch("batchSize");

	const onSubmit = async (values: RolloutForm) => {
		await mutateAsync({ applicationId, ...values })
			.then(() => toast.success("Rollout strategy saved"))
			.catch((error) =>
				toast.error(
					readableErrorMessage(error, "Error saving the rollout strategy"),
				),
			);
		await Promise.all([
			utils.scaling.settings.invalidate({ applicationId }),
			utils.scaling.events.invalidate({ applicationId }),
			utils.application.one.invalidate({ applicationId }),
		]);
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Rollout strategy</CardTitle>
				<CardDescription>
					How Swarm replaces replicas when you deploy a new version.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<AlertBlock type="info">
					Applies on the next deploy. Swarm updates replicas in batches: with
					start-first a batch of new replicas starts before the old ones stop
					(extra replicas, no lost capacity); with stop-first old replicas stop
					first (no extra replicas, less capacity during the update). It cannot
					do both at once. Automatic rollbacks use the same order and batch
					size.
				</AlertBlock>
				{strategy === "start-first" && settings.hostPorts.length > 0 && (
					<AlertBlock type="warning">
						Port {settings.hostPorts.join(", ")} is published in host mode. A
						new replica cannot bind it while the old one on the same node is
						still running, so start-first updates stall unless every replica has
						a free node. Use stop-first, or publish the port in ingress mode.
					</AlertBlock>
				)}
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid gap-4 md:grid-cols-2"
					>
						<FormField
							control={form.control}
							name="strategy"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<FormLabel>Order</FormLabel>
									<FormControl>
										<RadioGroup
											value={field.value}
											onValueChange={field.onChange}
											className="flex flex-col gap-2"
										>
											<div className="flex items-start gap-2">
												<RadioGroupItem value="start-first" id="start-first" />
												<Label htmlFor="start-first" className="font-normal">
													Start new replicas first. Zero downtime; up to{" "}
													{batchSize || "all"} extra replica(s) run during the
													update.
												</Label>
											</div>
											<div className="flex items-start gap-2">
												<RadioGroupItem value="stop-first" id="stop-first" />
												<Label htmlFor="stop-first" className="font-normal">
													Stop old replicas first. No extra resources; up to{" "}
													{batchSize || "all"} replica(s) are unavailable during
													the update.
												</Label>
											</div>
										</RadioGroup>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<NumberField
							form={form}
							name="batchSize"
							label="Batch size"
							description="Replicas updated at a time. 0 updates all of them at once."
						/>
						<NumberField
							form={form}
							name="delaySeconds"
							label="Delay between batches (seconds)"
							description="Pause before starting the next batch."
						/>
						<NumberField
							form={form}
							name="monitorSeconds"
							label="Monitor window (seconds)"
							description="How long each updated replica is watched for failure."
						/>
						<NumberField
							form={form}
							name="maxFailureRatioPercent"
							label="Tolerated failures (%)"
							description="Share of replicas that may fail before the failure action runs."
						/>
						<FormField
							control={form.control}
							name="failureAction"
							render={({ field }) => (
								<FormItem>
									<FormLabel>When the update fails</FormLabel>
									<Select value={field.value} onValueChange={field.onChange}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="rollback">
												Roll back to the previous version
											</SelectItem>
											<SelectItem value="pause">Pause the update</SelectItem>
											<SelectItem value="continue">Continue anyway</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex items-end justify-end md:col-span-2">
							<Button type="submit" isLoading={isPending}>
								Save
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
};
