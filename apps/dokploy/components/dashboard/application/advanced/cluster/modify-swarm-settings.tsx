import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircle, Settings, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";

// Form-based schemas for better UX
const HealthCheckFormSchema = z.object({
	test: z.array(z.string()).default([]),
	interval: z.number().min(0).optional(),
	timeout: z.number().min(0).optional(),
	startPeriod: z.number().min(0).optional(),
	retries: z.number().min(0).optional(),
});

const RestartPolicyFormSchema = z.object({
	condition: z.enum(["on-failure", "any", "none"]).optional(),
	delay: z.number().min(0).optional(),
	maxAttempts: z.number().min(0).optional(),
	window: z.number().min(0).optional(),
});

const PreferenceFormSchema = z.object({
	spreadDescriptor: z.string(),
});

const PlatformFormSchema = z.object({
	architecture: z.string(),
	os: z.string(),
});

const PlacementFormSchema = z.object({
	constraints: z.array(z.string()).default([]),
	preferences: z.array(PreferenceFormSchema).default([]),
	maxReplicas: z.number().min(0).optional(),
	platforms: z.array(PlatformFormSchema).default([]),
});

const UpdateConfigFormSchema = z.object({
	parallelism: z.number().min(1).default(1),
	delay: z.number().min(0).optional(),
	failureAction: z.enum(["continue", "pause", "rollback"]).optional(),
	monitor: z.number().min(0).optional(),
	maxFailureRatio: z.number().min(0).max(1).optional(),
	order: z.enum(["start-first", "stop-first"]).default("start-first"),
});

const ServiceModeFormSchema = z.object({
	mode: z
		.enum(["replicated", "global", "replicated-job", "global-job"])
		.default("replicated"),
	replicas: z.number().min(0).optional(),
	maxConcurrent: z.number().min(0).optional(),
	totalCompletions: z.number().min(0).optional(),
});

const NetworkFormSchema = z.object({
	networks: z
		.array(
			z.object({
				target: z.string(),
				aliases: z.array(z.string()).default([]),
				driverOpts: z.record(z.string()).default({}),
			}),
		)
		.default([]),
});

const LabelFormSchema = z.object({
	labels: z
		.array(
			z.object({
				key: z.string(),
				value: z.string(),
			}),
		)
		.default([]),
});

const SwarmSettingsFormSchema = z.object({
	healthCheck: HealthCheckFormSchema,
	restartPolicy: RestartPolicyFormSchema,
	placement: PlacementFormSchema,
	updateConfig: UpdateConfigFormSchema,
	rollbackConfig: UpdateConfigFormSchema,
	mode: ServiceModeFormSchema,
	network: NetworkFormSchema,
	labels: LabelFormSchema,
});

type SwarmSettingsForm = z.infer<typeof SwarmSettingsFormSchema>;

interface Props {
	id: string;
	type: "postgres" | "mariadb" | "mongo" | "mysql" | "redis" | "application";
}

// Individual form components
const HealthCheckForm = ({ form }: { form: any }) => {
	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "healthCheck.test",
	});

	return (
		<div className="space-y-4">
			<div>
				<FormLabel>Test Commands</FormLabel>
				<FormDescription>Commands to run for health checking</FormDescription>
				<div className="space-y-2 mt-2">
					{fields.map((field, index) => (
						<div key={field.id} className="flex gap-2">
							<FormField
								control={form.control}
								name={`healthCheck.test.${index}`}
								render={({ field }) => (
									<FormItem className="flex-1">
										<FormControl>
											<Input
												placeholder="e.g., CMD-SHELL, curl -f http://localhost:3000/health"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => remove(index)}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					))}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => append("")}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Command
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<FormField
					control={form.control}
					name="healthCheck.interval"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Interval (ms)</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="10000"
									{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
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
					name="healthCheck.timeout"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Timeout (ms)</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="10000"
									{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
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
					name="healthCheck.startPeriod"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Start Period (ms)</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="10000"
									{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
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
					name="healthCheck.retries"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Retries</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="10"
									{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
										)
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		</div>
	);
};

const RestartPolicyForm = ({ form }: { form: any }) => {
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-4">
				<FormField
					control={form.control}
					name="restartPolicy.condition"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Condition</FormLabel>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select condition" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="on-failure">On Failure</SelectItem>
									<SelectItem value="any">Any</SelectItem>
									<SelectItem value="none">None</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="restartPolicy.delay"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Delay (ms)</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="10000"
									{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
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
					name="restartPolicy.maxAttempts"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Max Attempts</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="10"
									{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
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
					name="restartPolicy.window"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Window (ms)</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="10000"
									{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
										)
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		</div>
	);
};

const ServiceModeForm = ({ form }: { form: any }) => {
	const mode = form.watch("mode.mode");

	return (
		<div className="space-y-4">
			<FormField
				control={form.control}
				name="mode.mode"
				render={({ field }) => (
					<FormItem className="space-y-3">
						<FormLabel>Service Mode</FormLabel>
						<FormControl>
							<RadioGroup
								onValueChange={field.onChange}
								value={field.value}
								className="flex flex-col space-y-1"
							>
								<FormItem className="flex items-center space-x-3 space-y-0">
									<FormControl>
										<RadioGroupItem value="replicated" />
									</FormControl>
									<FormLabel className="font-normal">Replicated</FormLabel>
								</FormItem>
								<FormItem className="flex items-center space-x-3 space-y-0">
									<FormControl>
										<RadioGroupItem value="global" />
									</FormControl>
									<FormLabel className="font-normal">Global</FormLabel>
								</FormItem>
								<FormItem className="flex items-center space-x-3 space-y-0">
									<FormControl>
										<RadioGroupItem value="replicated-job" />
									</FormControl>
									<FormLabel className="font-normal">Replicated Job</FormLabel>
								</FormItem>
								<FormItem className="flex items-center space-x-3 space-y-0">
									<FormControl>
										<RadioGroupItem value="global-job" />
									</FormControl>
									<FormLabel className="font-normal">Global Job</FormLabel>
								</FormItem>
							</RadioGroup>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			{mode === "replicated" && (
				<FormField
					control={form.control}
					name="mode.replicas"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Replicas</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="1"
									{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
										)
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			)}

			{mode === "replicated-job" && (
				<div className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="mode.maxConcurrent"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Max Concurrent</FormLabel>
								<FormControl>
									<Input
										type="number"
										placeholder="1"
										{...field}
										onChange={(e) =>
											field.onChange(
												e.target.value ? Number(e.target.value) : undefined,
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
						name="mode.totalCompletions"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Total Completions</FormLabel>
								<FormControl>
									<Input
										type="number"
										placeholder="1"
										{...field}
										onChange={(e) =>
											field.onChange(
												e.target.value ? Number(e.target.value) : undefined,
											)
										}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
			)}
		</div>
	);
};

const PlacementForm = ({ form }: { form: any }) => {
	const {
		fields: constraintFields,
		append: appendConstraint,
		remove: removeConstraint,
	} = useFieldArray({
		control: form.control,
		name: "placement.constraints",
	});

	const {
		fields: preferenceFields,
		append: appendPreference,
		remove: removePreference,
	} = useFieldArray({
		control: form.control,
		name: "placement.preferences",
	});

	const {
		fields: platformFields,
		append: appendPlatform,
		remove: removePlatform,
	} = useFieldArray({
		control: form.control,
		name: "placement.platforms",
	});

	return (
		<div className="space-y-4">
				<div>
				<FormLabel>Constraints</FormLabel>
				<FormDescription>Placement constraints for the service</FormDescription>
				<div className="space-y-2 mt-2">
					{constraintFields.map((field, index) => (
						<div key={field.id} className="flex gap-2">
							<FormField
								control={form.control}
								name={`placement.constraints.${index}`}
								render={({ field }) => (
									<FormItem className="flex-1">
										<FormControl>
											<Input
												placeholder="e.g., node.role==manager"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => removeConstraint(index)}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
				</div>
					))}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => appendConstraint("")}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Constraint
					</Button>
				</div>
			</div>

			<div>
				<FormLabel>Preferences</FormLabel>
				<FormDescription>Placement preferences for the service</FormDescription>
				<div className="space-y-2 mt-2">
					{preferenceFields.map((field, index) => (
						<div key={field.id} className="flex gap-2">
						<FormField
							control={form.control}
								name={`placement.preferences.${index}.spreadDescriptor`}
							render={({ field }) => (
									<FormItem className="flex-1">
										<FormControl>
											<Input
												placeholder="e.g., node.labels.region"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => removePreference(index)}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					))}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => appendPreference({ spreadDescriptor: "" })}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Preference
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<FormField
					control={form.control}
					name="placement.maxReplicas"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Max Replicas</FormLabel>
									<FormControl>
								<Input
									type="number"
									placeholder="10"
											{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
										)
									}
										/>
									</FormControl>
										<FormMessage />
								</FormItem>
							)}
						/>
			</div>

			<div>
				<FormLabel>Platforms</FormLabel>
				<FormDescription>Platform constraints for the service</FormDescription>
				<div className="space-y-2 mt-2">
					{platformFields.map((field, index) => (
						<div key={field.id} className="flex gap-2">
						<FormField
							control={form.control}
								name={`placement.platforms.${index}.architecture`}
							render={({ field }) => (
									<FormItem className="flex-1">
										<FormControl>
											<Input placeholder="e.g., amd64" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name={`placement.platforms.${index}.os`}
								render={({ field }) => (
									<FormItem className="flex-1">
										<FormControl>
											<Input placeholder="e.g., linux" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => removePlatform(index)}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					))}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => appendPlatform({ architecture: "", os: "" })}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Platform
					</Button>
				</div>
			</div>
		</div>
	);
};

const UpdateConfigForm = ({ form, name }: { form: any; name: string }) => {
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-4">
				<FormField
					control={form.control}
					name={`${name}.parallelism`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Parallelism</FormLabel>
									<FormControl>
								<Input
									type="number"
									placeholder="1"
											{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
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
					name={`${name}.order`}
							render={({ field }) => (
						<FormItem>
							<FormLabel>Order</FormLabel>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select order" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="start-first">Start First</SelectItem>
									<SelectItem value="stop-first">Stop First</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={`${name}.delay`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Delay (ms)</FormLabel>
									<FormControl>
								<Input
									type="number"
									placeholder="10000"
											{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
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
					name={`${name}.failureAction`}
							render={({ field }) => (
						<FormItem>
							<FormLabel>Failure Action</FormLabel>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select action" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="continue">Continue</SelectItem>
									<SelectItem value="pause">Pause</SelectItem>
									<SelectItem value="rollback">Rollback</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={`${name}.monitor`}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Monitor (ms)</FormLabel>
									<FormControl>
								<Input
									type="number"
									placeholder="10000"
											{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
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
					name={`${name}.maxFailureRatio`}
							render={({ field }) => (
						<FormItem>
							<FormLabel>Max Failure Ratio</FormLabel>
									<FormControl>
								<Input
									type="number"
									step="0.1"
									min="0"
									max="1"
									placeholder="0.1"
											{...field}
									onChange={(e) =>
										field.onChange(
											e.target.value ? Number(e.target.value) : undefined,
										)
									}
										/>
									</FormControl>
										<FormMessage />
								</FormItem>
							)}
						/>
			</div>
		</div>
	);
};

const NetworkForm = ({ form }: { form: any }) => {
	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "network.networks",
	});

	return (
		<div className="space-y-4">
			<div>
				<FormLabel>Network Configurations</FormLabel>
				<FormDescription>
					Configure network settings for the service
				</FormDescription>
				<div className="space-y-4 mt-2">
					{fields.map((field, index) => (
						<div key={field.id} className="p-4 border rounded-lg space-y-4">
							<div className="flex justify-between items-center">
								<FormLabel>Network {index + 1}</FormLabel>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => remove(index)}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>

							<div className="grid grid-cols-2 gap-4">
						<FormField
							control={form.control}
									name={`network.networks.${index}.target`}
							render={({ field }) => (
										<FormItem>
											<FormLabel>Target</FormLabel>
											<FormControl>
												<Input placeholder="e.g., dokploy-network" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<div>
								<FormLabel>Aliases</FormLabel>
								<FormDescription>
									Network aliases for this network
												</FormDescription>
								<NetworkAliasesForm form={form} networkIndex={index} />
							</div>

							<div>
								<FormLabel>Driver Options</FormLabel>
								<FormDescription>
									Driver-specific options for this network
								</FormDescription>
								<NetworkDriverOptsForm form={form} networkIndex={index} />
							</div>
						</div>
					))}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => append({ target: "", aliases: [], driverOpts: {} })}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Network
					</Button>
				</div>
			</div>
		</div>
	);
};

const NetworkAliasesForm = ({
	form,
	networkIndex,
}: {
	form: any;
	networkIndex: number;
}) => {
	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: `network.networks.${networkIndex}.aliases`,
	});

	return (
		<div className="space-y-2 mt-2">
			{fields.map((field, index) => (
				<div key={field.id} className="flex gap-2">
					<FormField
						control={form.control}
						name={`network.networks.${networkIndex}.aliases.${index}`}
						render={({ field }) => (
							<FormItem className="flex-1">
									<FormControl>
									<Input placeholder="e.g., my-alias" {...field} />
									</FormControl>
										<FormMessage />
								</FormItem>
							)}
						/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => remove(index)}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => append("")}
			>
				<Plus className="h-4 w-4 mr-2" />
				Add Alias
			</Button>
		</div>
	);
};

const NetworkDriverOptsForm = ({
	form,
	networkIndex,
}: {
	form: any;
	networkIndex: number;
}) => {
	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: `network.networks.${networkIndex}.driverOpts`,
	});

	return (
		<div className="space-y-2 mt-2">
			{fields.map((field, index) => (
				<div key={field.id} className="flex gap-2">
						<FormField
							control={form.control}
						name={`network.networks.${networkIndex}.driverOpts.${index}.key`}
							render={({ field }) => (
							<FormItem className="flex-1">
									<FormControl>
									<Input
										placeholder="e.g., com.docker.network.driver.mtu"
											{...field}
										/>
									</FormControl>
										<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
						name={`network.networks.${networkIndex}.driverOpts.${index}.value`}
							render={({ field }) => (
							<FormItem className="flex-1">
								<FormControl>
									<Input placeholder="e.g., 1500" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => remove(index)}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => append({ key: "", value: "" })}
			>
				<Plus className="h-4 w-4 mr-2" />
				Add Driver Option
			</Button>
		</div>
	);
};

const LabelsForm = ({ form }: { form: any }) => {
	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "labels.labels",
	});

	return (
		<div className="space-y-4">
			<div>
				<FormLabel>Service Labels</FormLabel>
				<FormDescription>Configure labels for the service</FormDescription>
				<div className="space-y-2 mt-2">
					{fields.map((field, index) => (
						<div key={field.id} className="flex gap-2">
							<FormField
								control={form.control}
								name={`labels.labels.${index}.key`}
								render={({ field }) => (
									<FormItem className="flex-1">
									<FormControl>
											<Input
												placeholder="e.g., com.example.app.name"
											{...field}
										/>
									</FormControl>
										<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
								name={`labels.labels.${index}.value`}
							render={({ field }) => (
									<FormItem className="flex-1">
										<FormControl>
											<Input placeholder="e.g., my-app" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => remove(index)}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					))}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => append({ key: "", value: "" })}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Label
					</Button>
				</div>
			</div>
		</div>
	);
};

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

	const form = useForm<SwarmSettingsForm>({
		defaultValues: {
			healthCheck: {
				test: [],
				interval: undefined,
				timeout: undefined,
				startPeriod: undefined,
				retries: undefined,
			},
			restartPolicy: {
				condition: undefined,
				delay: undefined,
				maxAttempts: undefined,
				window: undefined,
			},
			placement: {
				constraints: [],
				preferences: [],
				maxReplicas: undefined,
				platforms: [],
			},
			updateConfig: {
				parallelism: 1,
				delay: undefined,
				failureAction: undefined,
				monitor: undefined,
				maxFailureRatio: undefined,
				order: "start-first",
			},
			rollbackConfig: {
				parallelism: 1,
				delay: undefined,
				failureAction: undefined,
				monitor: undefined,
				maxFailureRatio: undefined,
				order: "start-first",
			},
			mode: {
				mode: "replicated",
				replicas: undefined,
				maxConcurrent: undefined,
				totalCompletions: undefined,
			},
			network: {
				networks: [],
			},
			labels: {
				labels: [],
			},
		},
		resolver: zodResolver(SwarmSettingsFormSchema),
	});

	// Helper function to convert form data to API format
	const convertFormToApiFormat = (formData: SwarmSettingsForm) => {
		const result: any = {};

		// Health Check
		if (formData.healthCheck.test.length > 0) {
			result.healthCheckSwarm = {
				Test: formData.healthCheck.test,
				...(formData.healthCheck.interval && {
					Interval: formData.healthCheck.interval,
				}),
				...(formData.healthCheck.timeout && {
					Timeout: formData.healthCheck.timeout,
				}),
				...(formData.healthCheck.startPeriod && {
					StartPeriod: formData.healthCheck.startPeriod,
				}),
				...(formData.healthCheck.retries && {
					Retries: formData.healthCheck.retries,
				}),
			};
		}

		// Restart Policy
		if (formData.restartPolicy.condition || formData.restartPolicy.delay || formData.restartPolicy.maxAttempts || formData.restartPolicy.window) {
			result.restartPolicySwarm = {
				...(formData.restartPolicy.condition && {
					Condition: formData.restartPolicy.condition,
				}),
				...(formData.restartPolicy.delay && {
					Delay: formData.restartPolicy.delay,
				}),
				...(formData.restartPolicy.maxAttempts && {
					MaxAttempts: formData.restartPolicy.maxAttempts,
				}),
				...(formData.restartPolicy.window && {
					Window: formData.restartPolicy.window,
				}),
			};
		}

		// Placement
		if (formData.placement.constraints.length > 0 || formData.placement.preferences.length > 0 || formData.placement.maxReplicas || formData.placement.platforms.length > 0) {
			result.placementSwarm = {
				...(formData.placement.constraints.length > 0 && {
					Constraints: formData.placement.constraints,
				}),
				...(formData.placement.preferences.length > 0 && {
					Preferences: formData.placement.preferences.map((p) => ({
						Spread: { SpreadDescriptor: p.spreadDescriptor },
					})),
				}),
				...(formData.placement.maxReplicas && {
					MaxReplicas: formData.placement.maxReplicas,
				}),
				...(formData.placement.platforms.length > 0 && {
					Platforms: formData.placement.platforms.map((p) => ({
						Architecture: p.architecture,
						OS: p.os,
					})),
				}),
			};
		}

		// Update Config
		if (formData.updateConfig.delay || formData.updateConfig.failureAction || formData.updateConfig.monitor || formData.updateConfig.maxFailureRatio) {
			result.updateConfigSwarm = {
				Parallelism: formData.updateConfig.parallelism,
				...(formData.updateConfig.delay && {
					Delay: formData.updateConfig.delay,
				}),
				...(formData.updateConfig.failureAction && {
					FailureAction: formData.updateConfig.failureAction,
				}),
				...(formData.updateConfig.monitor && {
					Monitor: formData.updateConfig.monitor,
				}),
				...(formData.updateConfig.maxFailureRatio && {
					MaxFailureRatio: formData.updateConfig.maxFailureRatio,
				}),
				Order: formData.updateConfig.order,
			};
		}

		// Rollback Config
		if (formData.rollbackConfig.delay || formData.rollbackConfig.failureAction || formData.rollbackConfig.monitor || formData.rollbackConfig.maxFailureRatio) {
			result.rollbackConfigSwarm = {
				Parallelism: formData.rollbackConfig.parallelism,
				...(formData.rollbackConfig.delay && {
					Delay: formData.rollbackConfig.delay,
				}),
				...(formData.rollbackConfig.failureAction && {
					FailureAction: formData.rollbackConfig.failureAction,
				}),
				...(formData.rollbackConfig.monitor && {
					Monitor: formData.rollbackConfig.monitor,
				}),
				...(formData.rollbackConfig.maxFailureRatio && {
					MaxFailureRatio: formData.rollbackConfig.maxFailureRatio,
				}),
				Order: formData.rollbackConfig.order,
			};
		}

		// Mode
		if (formData.mode.mode !== "replicated" || formData.mode.replicas || formData.mode.maxConcurrent || formData.mode.totalCompletions) {
			const modeConfig: any = {};
			if (formData.mode.mode === "replicated" && formData.mode.replicas) {
				modeConfig.Replicated = { Replicas: formData.mode.replicas };
			} else if (formData.mode.mode === "global") {
				modeConfig.Global = {};
			} else if (formData.mode.mode === "replicated-job") {
				modeConfig.ReplicatedJob = {
					...(formData.mode.maxConcurrent && {
						MaxConcurrent: formData.mode.maxConcurrent,
					}),
					...(formData.mode.totalCompletions && {
						TotalCompletions: formData.mode.totalCompletions,
					}),
				};
			} else if (formData.mode.mode === "global-job") {
				modeConfig.GlobalJob = {};
			}
			result.modeSwarm = modeConfig;
		}

		// Network
		if (formData.network.networks.length > 0) {
			result.networkSwarm = formData.network.networks.map((network) => ({
				...(network.target && { Target: network.target }),
				...(network.aliases.length > 0 && { Aliases: network.aliases }),
				...(Object.keys(network.driverOpts).length > 0 && {
					DriverOpts: network.driverOpts,
				}),
			}));
		}

		// Labels
		if (formData.labels.labels.length > 0) {
			result.labelsSwarm = formData.labels.labels.reduce(
				(acc, label) => {
					if (label.key && label.value) {
						acc[label.key] = label.value;
					}
					return acc;
				},
				{} as Record<string, string>,
			);
		}

		return result;
	};

	// Helper function to convert API data to form format
	const convertApiToFormFormat = (apiData: any): SwarmSettingsForm => {
		return {
			healthCheck: {
				test: apiData.healthCheckSwarm?.Test || [],
				interval: apiData.healthCheckSwarm?.Interval,
				timeout: apiData.healthCheckSwarm?.Timeout,
				startPeriod: apiData.healthCheckSwarm?.StartPeriod,
				retries: apiData.healthCheckSwarm?.Retries,
			},
			restartPolicy: {
				condition: apiData.restartPolicySwarm?.Condition,
				delay: apiData.restartPolicySwarm?.Delay,
				maxAttempts: apiData.restartPolicySwarm?.MaxAttempts,
				window: apiData.restartPolicySwarm?.Window,
			},
			placement: {
				constraints: apiData.placementSwarm?.Constraints || [],
				preferences:
					apiData.placementSwarm?.Preferences?.map((p: any) => ({
						spreadDescriptor: p.Spread?.SpreadDescriptor || "",
					})) || [],
				maxReplicas: apiData.placementSwarm?.MaxReplicas,
				platforms:
					apiData.placementSwarm?.Platforms?.map((p: any) => ({
						architecture: p.Architecture || "",
						os: p.OS || "",
					})) || [],
			},
			updateConfig: {
				parallelism: apiData.updateConfigSwarm?.Parallelism || 1,
				delay: apiData.updateConfigSwarm?.Delay,
				failureAction: apiData.updateConfigSwarm?.FailureAction,
				monitor: apiData.updateConfigSwarm?.Monitor,
				maxFailureRatio: apiData.updateConfigSwarm?.MaxFailureRatio,
				order: apiData.updateConfigSwarm?.Order || "start-first",
			},
			rollbackConfig: {
				parallelism: apiData.rollbackConfigSwarm?.Parallelism || 1,
				delay: apiData.rollbackConfigSwarm?.Delay,
				failureAction: apiData.rollbackConfigSwarm?.FailureAction,
				monitor: apiData.rollbackConfigSwarm?.Monitor,
				maxFailureRatio: apiData.rollbackConfigSwarm?.MaxFailureRatio,
				order: apiData.rollbackConfigSwarm?.Order || "start-first",
			},
			mode: {
				mode: apiData.modeSwarm?.Replicated
					? "replicated"
					: apiData.modeSwarm?.Global
						? "global"
						: apiData.modeSwarm?.ReplicatedJob
							? "replicated-job"
							: apiData.modeSwarm?.GlobalJob
								? "global-job"
								: "replicated",
				replicas: apiData.modeSwarm?.Replicated?.Replicas,
				maxConcurrent: apiData.modeSwarm?.ReplicatedJob?.MaxConcurrent,
				totalCompletions: apiData.modeSwarm?.ReplicatedJob?.TotalCompletions,
			},
			network: {
				networks:
					apiData.networkSwarm?.map((n: any) => ({
						target: n.Target || "",
						aliases: n.Aliases || [],
						driverOpts: n.DriverOpts || {},
					})) || [],
			},
			labels: {
				labels: apiData.labelsSwarm
					? Object.entries(apiData.labelsSwarm).map(([key, value]) => ({
							key,
							value: value as string,
						}))
					: [],
			},
		};
	};

	useEffect(() => {
		if (data) {
			const formData = convertApiToFormFormat(data);
			form.reset(formData);
		}
	}, [form, data]);

	const onSubmit = async (formData: SwarmSettingsForm) => {
		const apiData = convertFormToApiFormat(formData);

		await mutateAsync({
			applicationId: id || "",
			postgresId: id || "",
			redisId: id || "",
			mysqlId: id || "",
			mariadbId: id || "",
			mongoId: id || "",
			...apiData,
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
			<DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Swarm Settings</DialogTitle>
					<DialogDescription>
						Configure Docker Swarm settings using organized tabs and intuitive
						form fields.
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
						id="swarm-settings-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="mt-4"
					>
						<Tabs defaultValue="health-check" className="w-full">
							<TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
								<TabsTrigger value="health-check">Health Check</TabsTrigger>
								<TabsTrigger value="restart-policy">Restart Policy</TabsTrigger>
								<TabsTrigger value="placement">Placement</TabsTrigger>
								<TabsTrigger value="update-config">Update Config</TabsTrigger>
								<TabsTrigger value="rollback-config">
									Rollback Config
								</TabsTrigger>
								<TabsTrigger value="mode">Service Mode</TabsTrigger>
								<TabsTrigger value="network">Network</TabsTrigger>
								<TabsTrigger value="labels">Labels</TabsTrigger>
							</TabsList>

						<TabsContent value="health-check" className="space-y-4">
							<div className="space-y-4 p-4 border rounded-lg">
								<div className="space-y-1">
									<FormLabel className="text-base font-medium">
										Health Check
									</FormLabel>
									<FormDescription>
										Configure health check settings for the service
												</FormDescription>
								</div>
								<HealthCheckForm form={form} />
							</div>
						</TabsContent>

						<TabsContent value="restart-policy" className="space-y-4">
							<div className="space-y-4 p-4 border rounded-lg">
								<div className="space-y-1">
									<FormLabel className="text-base font-medium">
										Restart Policy
									</FormLabel>
									<FormDescription>
										Configure restart policy for the service
									</FormDescription>
								</div>
								<RestartPolicyForm form={form} />
							</div>
						</TabsContent>

						<TabsContent value="placement" className="space-y-4">
							<div className="space-y-4 p-4 border rounded-lg">
								<div className="space-y-1">
									<FormLabel className="text-base font-medium">
										Placement
									</FormLabel>
									<FormDescription>
										Configure placement constraints and preferences
												</FormDescription>
								</div>
								<PlacementForm form={form} />
							</div>
						</TabsContent>

							<TabsContent value="update-config" className="space-y-4">
								<div className="space-y-4 p-4 border rounded-lg">
									<div className="space-y-1">
										<FormLabel className="text-base font-medium">
											Update Config
										</FormLabel>
										<FormDescription>
											Configure update settings for the service
										</FormDescription>
									</div>
									<UpdateConfigForm form={form} name="updateConfig" />
								</div>
							</TabsContent>

							<TabsContent value="rollback-config" className="space-y-4">
								<div className="space-y-4 p-4 border rounded-lg">
									<div className="space-y-1">
										<FormLabel className="text-base font-medium">
											Rollback Config
										</FormLabel>
										<FormDescription>
											Configure rollback settings for the service
												</FormDescription>
									</div>
									<UpdateConfigForm form={form} name="rollbackConfig" />
								</div>
							</TabsContent>

							<TabsContent value="mode" className="space-y-4">
								<div className="space-y-4 p-4 border rounded-lg">
									<div className="space-y-1">
										<FormLabel className="text-base font-medium">
											Service Mode
										</FormLabel>
										<FormDescription>
											Configure service mode and scaling settings
										</FormDescription>
									</div>
									<ServiceModeForm form={form} />
								</div>
							</TabsContent>

							<TabsContent value="network" className="space-y-4">
								<div className="space-y-4 p-4 border rounded-lg">
									<div className="space-y-1">
										<FormLabel className="text-base font-medium">
											Network
										</FormLabel>
										<FormDescription>
											Configure network settings for the service
										</FormDescription>
									</div>
									<NetworkForm form={form} />
								</div>
							</TabsContent>

							<TabsContent value="labels" className="space-y-4">
								<div className="space-y-4 p-4 border rounded-lg">
									<div className="space-y-1">
										<FormLabel className="text-base font-medium">
											Labels
										</FormLabel>
										<FormDescription>
											Configure labels for the service
										</FormDescription>
									</div>
									<LabelsForm form={form} />
								</div>
							</TabsContent>
						</Tabs>

						<DialogFooter className="flex w-full flex-row justify-end">
							<Button
								isLoading={isLoading}
								form="swarm-settings-form"
								type="submit"
							>
								Update Settings
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
