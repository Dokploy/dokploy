import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircle, Plus, Settings, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/utils/api";

const HealthCheckSwarmSchema = z
	.object({
		Test: z.array(z.string()).optional(),
		Interval: z.number().optional(),
		Timeout: z.number().optional(),
		StartPeriod: z.number().optional(),
		Retries: z.number().optional(),
	})
	.strict();

const RestartPolicySwarmSchema = z
	.object({
		Condition: z.string().optional(),
		Delay: z.number().optional(),
		MaxAttempts: z.number().optional(),
		Window: z.number().optional(),
	})
	.strict();

const PreferenceSchema = z
	.object({
		Spread: z.object({
			SpreadDescriptor: z.string(),
		}),
	})
	.strict();

const PlatformSchema = z
	.object({
		Architecture: z.string(),
		OS: z.string(),
	})
	.strict();

const PlacementSwarmSchema = z
	.object({
		Constraints: z.array(z.string()).optional(),
		Preferences: z.array(PreferenceSchema).optional(),
		MaxReplicas: z.number().optional(),
		Platforms: z.array(PlatformSchema).optional(),
	})
	.strict();

const UpdateConfigSwarmSchema = z
	.object({
		Parallelism: z.number(),
		Delay: z.number().optional(),
		FailureAction: z.string().optional(),
		Monitor: z.number().optional(),
		MaxFailureRatio: z.number().optional(),
		Order: z.string(),
	})
	.strict();

const ReplicatedSchema = z
	.object({
		Replicas: z.number().optional(),
	})
	.strict();

const ReplicatedJobSchema = z
	.object({
		MaxConcurrent: z.number().optional(),
		TotalCompletions: z.number().optional(),
	})
	.strict();

const ServiceModeSwarmSchema = z
	.object({
		Replicated: ReplicatedSchema.optional(),
		Global: z.object({}).optional(),
		ReplicatedJob: ReplicatedJobSchema.optional(),
		GlobalJob: z.object({}).optional(),
	})
	.strict();

const NetworkSwarmSchema = z.array(
	z
		.object({
			Target: z.string().optional(),
			Aliases: z.array(z.string()).optional(),
			DriverOpts: z.object({}).optional(),
		})
		.strict(),
);

const LabelsSwarmSchema = z.record(z.string());

const EndpointPortConfigSwarmSchema = z
	.object({
		Protocol: z.string().optional(),
		TargetPort: z.number().optional(),
		PublishedPort: z.number().optional(),
		PublishMode: z.string().optional(),
	})
	.strict();

const EndpointSpecSwarmSchema = z
	.object({
		Mode: z.string().optional(),
		Ports: z.array(EndpointPortConfigSwarmSchema).optional(),
	})
	.strict();

const addSwarmSettings = z.object({
	healthCheckSwarm: HealthCheckSwarmSchema.nullable(),
	restartPolicySwarm: RestartPolicySwarmSchema.nullable(),
	placementSwarm: PlacementSwarmSchema.nullable(),
	updateConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	rollbackConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	modeSwarm: ServiceModeSwarmSchema.nullable(),
	labelsSwarm: LabelsSwarmSchema.nullable(),
	networkSwarm: NetworkSwarmSchema.nullable(),
	stopGracePeriodSwarm: z.bigint().nullable(),
	endpointSpecSwarm: EndpointSpecSwarmSchema.nullable(),
});

type AddSwarmSettings = z.infer<typeof addSwarmSettings>;

const hasStopGracePeriodSwarm = (
	value: unknown,
): value is { stopGracePeriodSwarm: bigint | number | string | null } =>
	typeof value === "object" &&
	value !== null &&
	"stopGracePeriodSwarm" in value;

interface Props {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

export const AddSwarmSettings = ({ id, type }: Props) => {
	const queryMap = {
		postgres: () =>
			api.postgres.one.useQuery({ postgresId: id }, { enabled: !!id }),
		redis: () => api.redis.one.useQuery({ redisId: id }, { enabled: !!id }),
		mysql: () => api.mysql.one.useQuery({ mysqlId: id }, { enabled: !!id }),
		mariadb: () =>
			api.mariadb.one.useQuery({ mariadbId: id }, { enabled: !!id }),
		application: () =>
			api.application.one.useQuery({ applicationId: id }, { enabled: !!id }),
		mongo: () => api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id }),
	};
	const { data, refetch } = queryMap[type]
		? queryMap[type]()
		: api.mongo.one.useQuery({ mongoId: id }, { enabled: !!id });

	const mutationMap = {
		postgres: () => api.postgres.update.useMutation(),
		redis: () => api.redis.update.useMutation(),
		mysql: () => api.mysql.update.useMutation(),
		mariadb: () => api.mariadb.update.useMutation(),
		application: () => api.application.update.useMutation(),
		mongo: () => api.mongo.update.useMutation(),
	};

	const { mutateAsync, isError, error, isLoading } = mutationMap[type]
		? mutationMap[type]()
		: api.mongo.update.useMutation();

	const form = useForm<AddSwarmSettings>({
		defaultValues: {
			healthCheckSwarm: null,
			restartPolicySwarm: null,
			placementSwarm: null,
			updateConfigSwarm: null,
			rollbackConfigSwarm: null,
			modeSwarm: null,
			labelsSwarm: null,
			networkSwarm: null,
			stopGracePeriodSwarm: null,
			endpointSpecSwarm: null,
		},
		resolver: zodResolver(addSwarmSettings),
	});

	useEffect(() => {
		if (data) {
			const stopGracePeriodValue = hasStopGracePeriodSwarm(data)
				? data.stopGracePeriodSwarm
				: null;
			const normalizedStopGracePeriod =
				stopGracePeriodValue === null || stopGracePeriodValue === undefined
					? null
					: typeof stopGracePeriodValue === "bigint"
						? stopGracePeriodValue
						: BigInt(stopGracePeriodValue);
			form.reset({
				healthCheckSwarm: data.healthCheckSwarm || null,
				restartPolicySwarm: data.restartPolicySwarm || null,
				placementSwarm: data.placementSwarm || null,
				updateConfigSwarm: data.updateConfigSwarm || null,
				rollbackConfigSwarm: data.rollbackConfigSwarm || null,
				modeSwarm: data.modeSwarm || null,
				labelsSwarm: data.labelsSwarm || null,
				networkSwarm: data.networkSwarm || null,
				stopGracePeriodSwarm: normalizedStopGracePeriod,
				endpointSpecSwarm: data.endpointSpecSwarm || null,
			});
		}
	}, [form, form.reset, data]);

	const onSubmit = async (data: AddSwarmSettings) => {
		await mutateAsync({
			applicationId: id || "",
			postgresId: id || "",
			redisId: id || "",
			mysqlId: id || "",
			mariadbId: id || "",
			mongoId: id || "",
			healthCheckSwarm: data.healthCheckSwarm,
			restartPolicySwarm: data.restartPolicySwarm,
			placementSwarm: data.placementSwarm,
			updateConfigSwarm: data.updateConfigSwarm,
			rollbackConfigSwarm: data.rollbackConfigSwarm,
			modeSwarm: data.modeSwarm,
			labelsSwarm: data.labelsSwarm,
			networkSwarm: data.networkSwarm,
			stopGracePeriodSwarm: data.stopGracePeriodSwarm ?? null,
			endpointSpecSwarm: data.endpointSpecSwarm,
		})
			.then(async () => {
				toast.success("Swarm settings updated");
				refetch();
			})
			.catch(() => {
				toast.error("Error updating the swarm settings");
			});
	};
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="secondary" className="cursor-pointer w-fit">
					<Settings className="size-4 text-muted-foreground" />
					Swarm Settings
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>Swarm Settings</DialogTitle>
					<DialogDescription>
						Configure swarm settings using form fields.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<div>
					<AlertBlock type="info">
						Changing settings such as placements may cause the logs/monitoring,
						backups and other features to be unavailable.
					</AlertBlock>
				</div>

				<Form {...form}>
					<form
						id="hook-form-add-permissions"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid  grid-cols-1 md:grid-cols-2  w-full gap-4 relative mt-4"
					>
						<div className="md:col-span-2 space-y-4 border rounded-md p-4">
							<FormLabel>Health Check</FormLabel>
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
											Health check configuration
											<HelpCircle className="size-4 text-muted-foreground" />
										</FormDescription>
									</TooltipTrigger>
									<TooltipContent
										className="w-full z-[999]"
										align="start"
										side="bottom"
									>
										<code>
											<pre>
												{`{
	Test?: string[] | undefined;
	Interval?: number | undefined;
	Timeout?: number | undefined;
	StartPeriod?: number | undefined;
	Retries?: number | undefined;
}`}
											</pre>
										</code>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<FormField
								control={form.control}
								name="healthCheckSwarm"
								render={() => {
									const testArray = form.watch("healthCheckSwarm.Test") || [];
									return (
										<>
											<div>
												<FormLabel className="text-sm">Test Commands</FormLabel>
												<div className="space-y-2 mt-2">
													{testArray.map((_, index) => (
														<div key={index} className="flex gap-2">
															<FormControl>
																<Input
																	placeholder="e.g., CMD-SHELL, curl -f http://localhost:3000/health"
																	value={testArray[index] || ""}
																	onChange={(e) => {
																		const newArray = [...testArray];
																		newArray[index] = e.target.value;
																		form.setValue("healthCheckSwarm", {
																			...form.getValues("healthCheckSwarm"),
																			Test: newArray,
																		});
																	}}
																/>
															</FormControl>
															<Button
																type="button"
																variant="outline"
																size="icon"
																onClick={() => {
																	const newArray = testArray.filter(
																		(_, i) => i !== index,
																	);
																	form.setValue("healthCheckSwarm", {
																		...form.getValues("healthCheckSwarm"),
																		Test:
																			newArray.length > 0
																				? newArray
																				: undefined,
																	});
																}}
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</div>
													))}
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={() => {
															const current =
																form.getValues("healthCheckSwarm") || {};
															form.setValue("healthCheckSwarm", {
																...current,
																Test: [...(current.Test || []), ""],
															});
														}}
													>
														<Plus className="h-4 w-4 mr-2" />
														Add Test Command
													</Button>
												</div>
											</div>

											<div className="grid grid-cols-2 gap-4">
												<FormField
													control={form.control}
													name="healthCheckSwarm.Interval"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Interval (nanoseconds)</FormLabel>
															<FormControl>
																<Input
																	type="number"
																	placeholder="10000000000"
																	{...field}
																	value={field.value?.toString() || ""}
																	onChange={(e) =>
																		field.onChange(
																			e.target.value
																				? Number(e.target.value)
																				: undefined,
																		)
																	}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="healthCheckSwarm.Timeout"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Timeout (nanoseconds)</FormLabel>
															<FormControl>
																<Input
																	type="number"
																	placeholder="10000000000"
																	{...field}
																	value={field.value?.toString() || ""}
																	onChange={(e) =>
																		field.onChange(
																			e.target.value
																				? Number(e.target.value)
																				: undefined,
																		)
																	}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="healthCheckSwarm.StartPeriod"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Start Period (nanoseconds)</FormLabel>
															<FormControl>
																<Input
																	type="number"
																	placeholder="10000000000"
																	{...field}
																	value={field.value?.toString() || ""}
																	onChange={(e) =>
																		field.onChange(
																			e.target.value
																				? Number(e.target.value)
																				: undefined,
																		)
																	}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
												<FormField
													control={form.control}
													name="healthCheckSwarm.Retries"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Retries</FormLabel>
															<FormControl>
																<Input
																	type="number"
																	placeholder="10"
																	{...field}
																	value={field.value?.toString() || ""}
																	onChange={(e) =>
																		field.onChange(
																			e.target.value
																				? Number(e.target.value)
																				: undefined,
																		)
																	}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
											</div>
										</>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="healthCheckSwarm"
								render={() => <FormMessage />}
							/>
						</div>

						<div className="space-y-4 border rounded-md p-4">
							<FormLabel>Restart Policy</FormLabel>
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
											Restart policy configuration
											<HelpCircle className="size-4 text-muted-foreground" />
										</FormDescription>
									</TooltipTrigger>
									<TooltipContent
										className="w-full z-[999]"
										align="start"
										side="bottom"
									>
										<code>
											<pre>
												{`{
	Condition?: string | undefined;
	Delay?: number | undefined;
	MaxAttempts?: number | undefined;
	Window?: number | undefined;
}`}
											</pre>
										</code>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="restartPolicySwarm.Condition"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Condition</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || ""}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select condition" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="none">none</SelectItem>
													<SelectItem value="on-failure">on-failure</SelectItem>
													<SelectItem value="any">any</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="restartPolicySwarm.Delay"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Delay (nanoseconds)</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="10000000000"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="restartPolicySwarm.MaxAttempts"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Max Attempts</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="10"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="restartPolicySwarm.Window"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Window (nanoseconds)</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="10000000000"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<FormField
								control={form.control}
								name="restartPolicySwarm"
								render={() => <FormMessage />}
							/>
						</div>

						<div className="md:col-span-2 space-y-4 border rounded-md p-4">
							<FormLabel>Placement</FormLabel>
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
											Placement configuration
											<HelpCircle className="size-4 text-muted-foreground" />
										</FormDescription>
									</TooltipTrigger>
									<TooltipContent
										className="w-full z-[999]"
										align="start"
										side="bottom"
									>
										<code>
											<pre>
												{`{
	Constraints?: string[] | undefined;
	Preferences?: Array<{ Spread: { SpreadDescriptor: string } }> | undefined;
	MaxReplicas?: number | undefined;
	Platforms?: Array<{ Architecture: string; OS: string }> | undefined;
}`}
											</pre>
										</code>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<FormField
								control={form.control}
								name="placementSwarm"
								render={() => {
									const constraints =
										form.watch("placementSwarm.Constraints") || [];
									const preferences =
										form.watch("placementSwarm.Preferences") || [];
									const platforms =
										form.watch("placementSwarm.Platforms") || [];
									return (
										<>
											<div>
												<FormLabel className="text-sm">Constraints</FormLabel>
												<div className="space-y-2 mt-2">
													{constraints.map((_, index) => (
														<div key={index} className="flex gap-2">
															<FormControl>
																<Input
																	placeholder="e.g., node.role==manager"
																	value={constraints[index] || ""}
																	onChange={(e) => {
																		const newArray = [...constraints];
																		newArray[index] = e.target.value;
																		form.setValue("placementSwarm", {
																			...form.getValues("placementSwarm"),
																			Constraints: newArray,
																		});
																	}}
																/>
															</FormControl>
															<Button
																type="button"
																variant="outline"
																size="icon"
																onClick={() => {
																	const newArray = constraints.filter(
																		(_, i) => i !== index,
																	);
																	form.setValue("placementSwarm", {
																		...form.getValues("placementSwarm"),
																		Constraints:
																			newArray.length > 0
																				? newArray
																				: undefined,
																	});
																}}
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</div>
													))}
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={() => {
															const current =
																form.getValues("placementSwarm") || {};
															form.setValue("placementSwarm", {
																...current,
																Constraints: [
																	...(current.Constraints || []),
																	"",
																],
															});
														}}
													>
														<Plus className="h-4 w-4 mr-2" />
														Add Constraint
													</Button>
												</div>
											</div>

											<div>
												<FormLabel className="text-sm">Max Replicas</FormLabel>
												<FormField
													control={form.control}
													name="placementSwarm.MaxReplicas"
													render={({ field }) => (
														<FormItem>
															<FormControl>
																<Input
																	type="number"
																	placeholder="10"
																	{...field}
																	value={field.value?.toString() || ""}
																	onChange={(e) =>
																		field.onChange(
																			e.target.value
																				? Number(e.target.value)
																				: undefined,
																		)
																	}
																/>
															</FormControl>
															<FormMessage />
														</FormItem>
													)}
												/>
											</div>
										</>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="placementSwarm"
								render={() => <FormMessage />}
							/>
						</div>

						<div className="md:col-span-2 space-y-4 border rounded-md p-4">
							<FormLabel>Update Config</FormLabel>
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
											Update configuration
											<HelpCircle className="size-4 text-muted-foreground" />
										</FormDescription>
									</TooltipTrigger>
									<TooltipContent
										className="w-full z-[999]"
										align="start"
										side="bottom"
									>
										<code>
											<pre>
												{`{
	Parallelism?: number;
	Delay?: number | undefined;
	FailureAction?: string | undefined;
	Monitor?: number | undefined;
	MaxFailureRatio?: number | undefined;
	Order: string;
}`}
											</pre>
										</code>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="updateConfigSwarm.Parallelism"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Parallelism *</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="1"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(Number(e.target.value))
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="updateConfigSwarm.Order"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Order *</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || ""}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select order" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="start-first">
														start-first
													</SelectItem>
													<SelectItem value="stop-first">stop-first</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="updateConfigSwarm.Delay"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Delay (nanoseconds)</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="10000000000"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="updateConfigSwarm.FailureAction"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Failure Action</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || ""}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select action" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="continue">continue</SelectItem>
													<SelectItem value="pause">pause</SelectItem>
													<SelectItem value="rollback">rollback</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="updateConfigSwarm.Monitor"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Monitor (nanoseconds)</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="10000000000"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="updateConfigSwarm.MaxFailureRatio"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Max Failure Ratio</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="10"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<FormField
								control={form.control}
								name="updateConfigSwarm"
								render={() => <FormMessage />}
							/>
						</div>

						<div className="md:col-span-2 space-y-4 border rounded-md p-4">
							<FormLabel>Rollback Config</FormLabel>
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
											Rollback configuration
											<HelpCircle className="size-4 text-muted-foreground" />
										</FormDescription>
									</TooltipTrigger>
									<TooltipContent
										className="w-full z-[999]"
										align="start"
										side="bottom"
									>
										<code>
											<pre>
												{`{
	Parallelism?: number;
	Delay?: number | undefined;
	FailureAction?: string | undefined;
	Monitor?: number | undefined;
	MaxFailureRatio?: number | undefined;
	Order: string;
}`}
											</pre>
										</code>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="rollbackConfigSwarm.Parallelism"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Parallelism *</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="1"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(Number(e.target.value))
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="rollbackConfigSwarm.Order"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Order *</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || ""}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select order" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="start-first">
														start-first
													</SelectItem>
													<SelectItem value="stop-first">stop-first</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="rollbackConfigSwarm.Delay"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Delay (nanoseconds)</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="10000000000"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="rollbackConfigSwarm.FailureAction"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Failure Action</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || ""}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select action" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="continue">continue</SelectItem>
													<SelectItem value="pause">pause</SelectItem>
													<SelectItem value="rollback">rollback</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="rollbackConfigSwarm.Monitor"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Monitor (nanoseconds)</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="10000000000"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="rollbackConfigSwarm.MaxFailureRatio"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Max Failure Ratio</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="10"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) =>
														field.onChange(
															e.target.value
																? Number(e.target.value)
																: undefined,
														)
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<FormField
								control={form.control}
								name="rollbackConfigSwarm"
								render={() => <FormMessage />}
							/>
						</div>

						<div className="space-y-4 border rounded-md p-4">
							<FormLabel>Mode</FormLabel>
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
											Service mode configuration
											<HelpCircle className="size-4 text-muted-foreground" />
										</FormDescription>
									</TooltipTrigger>
									<TooltipContent
										className="w-full z-[999]"
										align="center"
										side="bottom"
									>
										<code>
											<pre>
												{`{
	Replicated?: { Replicas?: number | undefined } | undefined;
	Global?: {} | undefined;
	ReplicatedJob?: { MaxConcurrent?: number | undefined; TotalCompletions?: number | undefined } | undefined;
	GlobalJob?: {} | undefined;
}`}
											</pre>
										</code>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="modeSwarm.Replicated.Replicas"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Replicated - Replicas</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="1"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) => {
														const current = form.getValues("modeSwarm") || {};
														form.setValue("modeSwarm", {
															...current,
															Replicated: e.target.value
																? { Replicas: Number(e.target.value) }
																: undefined,
														});
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="modeSwarm.ReplicatedJob.MaxConcurrent"
									render={({ field }) => (
										<FormItem>
											<FormLabel>ReplicatedJob - Max Concurrent</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="1"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) => {
														const current = form.getValues("modeSwarm") || {};
														form.setValue("modeSwarm", {
															...current,
															ReplicatedJob: e.target.value
																? {
																		...current.ReplicatedJob,
																		MaxConcurrent: Number(e.target.value),
																	}
																: undefined,
														});
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="modeSwarm.ReplicatedJob.TotalCompletions"
									render={({ field }) => (
										<FormItem>
											<FormLabel>ReplicatedJob - Total Completions</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="1"
													{...field}
													value={field.value?.toString() || ""}
													onChange={(e) => {
														const current = form.getValues("modeSwarm") || {};
														form.setValue("modeSwarm", {
															...current,
															ReplicatedJob: e.target.value
																? {
																		...current.ReplicatedJob,
																		TotalCompletions: Number(e.target.value),
																	}
																: undefined,
														});
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<FormField
								control={form.control}
								name="modeSwarm"
								render={() => <FormMessage />}
							/>
						</div>
						<FormField
							control={form.control}
							name="networkSwarm"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<FormLabel>Network</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Network configuration (JSON array)
													<HelpCircle className="size-4 text-muted-foreground" />
												</FormDescription>
											</TooltipTrigger>
											<TooltipContent
												className="w-full z-[999]"
												align="start"
												side="bottom"
											>
												<code>
													<pre>
														{`[
  {
	"Target" : string | undefined;
	"Aliases" : string[] | undefined;
	"DriverOpts" : { [key: string]: string } | undefined;
  }
]`}
													</pre>
												</code>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									<FormControl>
										<Textarea
											placeholder={`[\n  {\n    "Target": "dokploy-network",\n    "Aliases": ["dokploy-network"],\n    "DriverOpts": {}\n  }\n]`}
											className="h-[12rem] font-mono"
											value={
												field.value ? JSON.stringify(field.value, null, 2) : ""
											}
											onChange={(e) => {
												try {
													const value = e.target.value.trim();
													if (!value) {
														field.onChange(null);
														return;
													}
													const parsed = JSON.parse(value);
													field.onChange(parsed);
												} catch {
													// Invalid JSON, but let validation handle it
													field.onChange(e.target.value as any);
												}
											}}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="labelsSwarm"
							render={({ field }) => (
								<FormItem className="md:col-span-2">
									<FormLabel>Labels</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Labels as key-value pairs (JSON object)
													<HelpCircle className="size-4 text-muted-foreground" />
												</FormDescription>
											</TooltipTrigger>
											<TooltipContent
												className="w-full z-[999]"
												align="start"
												side="bottom"
											>
												<code>
													<pre>
														{`{
	[name: string]: string;
}`}
													</pre>
												</code>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									<FormControl>
										<Textarea
											placeholder={`{\n  "com.example.app.name": "my-app",\n  "com.example.app.version": "1.0.0"\n}`}
											className="h-[12rem] font-mono"
											value={
												field.value ? JSON.stringify(field.value, null, 2) : ""
											}
											onChange={(e) => {
												try {
													const value = e.target.value.trim();
													if (!value) {
														field.onChange(null);
														return;
													}
													const parsed = JSON.parse(value);
													field.onChange(parsed);
												} catch {
													// Invalid JSON, but let validation handle it
													field.onChange(e.target.value as any);
												}
											}}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="stopGracePeriodSwarm"
							render={({ field }) => (
								<FormItem className="relative max-lg:px-4 lg:pl-6 ">
									<FormLabel>Stop Grace Period (nanoseconds)</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Duration in nanoseconds
													<HelpCircle className="size-4 text-muted-foreground" />
												</FormDescription>
											</TooltipTrigger>
											<TooltipContent
												className="w-full z-[999]"
												align="start"
												side="bottom"
											>
												<code>
													<pre>
														{`Enter duration in nanoseconds:
														• 30000000000 - 30 seconds
														• 120000000000 - 2 minutes  
														• 3600000000000 - 1 hour
														• 0 - no grace period`}
													</pre>
												</code>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									<FormControl>
										<Input
											type="number"
											placeholder="30000000000"
											className="font-mono"
											{...field}
											value={field?.value?.toString() || ""}
											onChange={(e) =>
												field.onChange(
													e.target.value ? BigInt(e.target.value) : null,
												)
											}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>
						<div className="md:col-span-2 space-y-4 border rounded-md p-4">
							<FormLabel>Endpoint Spec</FormLabel>
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
											Endpoint specification
											<HelpCircle className="size-4 text-muted-foreground" />
										</FormDescription>
									</TooltipTrigger>
									<TooltipContent
										className="w-full z-[999]"
										align="start"
										side="bottom"
									>
										<code>
											<pre>
												{`{
	Mode?: string | undefined;
	Ports?: Array<{
		Protocol?: string | undefined;
		TargetPort?: number | undefined;
		PublishedPort?: number | undefined;
		PublishMode?: string | undefined;
	}> | undefined;
}`}
											</pre>
										</code>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="endpointSpecSwarm.Mode"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Mode</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value || ""}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select mode" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="vip">vip</SelectItem>
													<SelectItem value="dnsrr">dnsrr</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<div>
								<FormLabel className="text-sm">Ports (JSON array)</FormLabel>
								<FormField
									control={form.control}
									name="endpointSpecSwarm"
									render={({ field }) => (
										<FormItem>
											<FormControl>
												<Textarea
													placeholder={`[\n  {\n    "Protocol": "tcp",\n    "TargetPort": 5432,\n    "PublishedPort": 5432,\n    "PublishMode": "host"\n  }\n]`}
													className="h-[12rem] font-mono"
													value={
														field.value?.Ports
															? JSON.stringify(field.value.Ports, null, 2)
															: ""
													}
													onChange={(e) => {
														try {
															const value = e.target.value.trim();
															if (!value) {
																field.onChange({
																	...field.value,
																	Ports: undefined,
																});
																return;
															}
															const parsed = JSON.parse(value);
															field.onChange({
																...field.value,
																Ports: parsed,
															});
														} catch {
															// Invalid JSON, but let validation handle it
														}
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<FormField
								control={form.control}
								name="endpointSpecSwarm"
								render={() => <FormMessage />}
							/>
						</div>
						<DialogFooter className="flex w-full flex-row justify-end md:col-span-2 m-0 sticky bottom-0 right-0 bg-muted border">
							<Button
								isLoading={isLoading}
								form="hook-form-add-permissions"
								type="submit"
							>
								Update
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
