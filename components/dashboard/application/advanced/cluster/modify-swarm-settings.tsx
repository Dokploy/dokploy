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
import { api } from "@/utils/api";
import { AlertBlock } from "@/components/shared/alert-block";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Textarea } from "@/components/ui/textarea";
import { Settings } from "lucide-react";

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

const UpdateConfigSwarmSchema = z.object({
	Parallelism: z.number(),
	Delay: z.number().optional(),
	FailureAction: z.string().optional(),
	Monitor: z.number().optional(),
	MaxFailureRatio: z.number().optional(),
	Order: z.string(),
});

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

const ServiceModeSwarmSchema = z.object({
	Replicated: ReplicatedSchema.optional(),
	Global: z.object({}).optional(),
	ReplicatedJob: ReplicatedJobSchema.optional(),
	GlobalJob: z.object({}).optional(),
});

const LabelsSwarmSchema = z.record(z.string());

const createStringToJSONSchema = (schema: z.ZodTypeAny) => {
	return z
		.string()
		.transform((str, ctx) => {
			if (str === null || str === "") {
				return null;
			}
			try {
				return JSON.parse(str);
			} catch (e) {
				ctx.addIssue({ code: "custom", message: "Invalid JSON format" });
				return z.NEVER;
			}
		})
		.superRefine((data, ctx) => {
			if (data === null) {
				return;
			}

			if (Object.keys(data).length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Object cannot be empty",
				});
				return;
			}

			const parseResult = schema.safeParse(data);
			if (!parseResult.success) {
				for (const error of parseResult.error.issues) {
					const path = error.path.join(".");
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `${path} ${error.message}`,
					});
				}
			}
		});
};

const addSwarmSettings = z.object({
	healthCheckSwarm: createStringToJSONSchema(HealthCheckSwarmSchema).nullable(),
	restartPolicySwarm: createStringToJSONSchema(
		RestartPolicySwarmSchema,
	).nullable(),
	placementSwarm: createStringToJSONSchema(PlacementSwarmSchema).nullable(),
	updateConfigSwarm: createStringToJSONSchema(
		UpdateConfigSwarmSchema,
	).nullable(),
	rollbackConfigSwarm: createStringToJSONSchema(
		UpdateConfigSwarmSchema,
	).nullable(),
	modeSwarm: createStringToJSONSchema(ServiceModeSwarmSchema).nullable(),
	labelsSwarm: createStringToJSONSchema(LabelsSwarmSchema).nullable(),
});

type AddSwarmSettings = z.infer<typeof addSwarmSettings>;

interface Props {
	applicationId: string;
}

export const AddSwarmSettings = ({ applicationId }: Props) => {
	const { data, refetch } = api.application.one.useQuery(
		{
			applicationId,
		},
		{
			enabled: !!applicationId,
		},
	);

	const { mutateAsync, isError, error, isLoading } =
		api.application.update.useMutation();

	const form = useForm<AddSwarmSettings>({
		defaultValues: {
			healthCheckSwarm: null,
			restartPolicySwarm: null,
			placementSwarm: null,
			updateConfigSwarm: null,
			rollbackConfigSwarm: null,
			modeSwarm: null,
			labelsSwarm: null,
		},
		resolver: zodResolver(addSwarmSettings),
	});

	useEffect(() => {
		if (data) {
			console.log(data.healthCheckSwarm, null);
			form.reset({
				healthCheckSwarm: data.healthCheckSwarm || null,
				restartPolicySwarm: data.restartPolicySwarm || null,
				placementSwarm: data.placementSwarm || null,
				updateConfigSwarm: data.updateConfigSwarm || null,
				rollbackConfigSwarm: data.rollbackConfigSwarm || null,
				modeSwarm: data.modeSwarm || null,
				labelsSwarm: data.labelsSwarm || null,
			});
		}
	}, [form, form.formState.isSubmitSuccessful, form.reset, data]);

	const onSubmit = async (data: AddSwarmSettings) => {
		console.log(data.restartPolicySwarm);
		await mutateAsync({
			applicationId,
			healthCheckSwarm: data.healthCheckSwarm
				? JSON.stringify(data.healthCheckSwarm)
				: null,
			restartPolicySwarm: data.restartPolicySwarm
				? JSON.stringify(data.restartPolicySwarm)
				: null,
			placementSwarm: data.placementSwarm
				? JSON.stringify(data.placementSwarm)
				: null,
			updateConfigSwarm: data.updateConfigSwarm
				? JSON.stringify(data.updateConfigSwarm)
				: null,
			rollbackConfigSwarm: data.rollbackConfigSwarm
				? JSON.stringify(data.rollbackConfigSwarm)
				: null,
			modeSwarm: data.modeSwarm ? JSON.stringify(data.modeSwarm) : null,
			labelsSwarm: data.labelsSwarm ? JSON.stringify(data.labelsSwarm) : null,
		})
			.then(async () => {
				toast.success("Swarm settings updated");
				refetch();
			})
			.catch(() => {
				toast.error("Error to update the swarm settings");
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
			<DialogContent className="max-h-[85vh]  overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Swarm Settings</DialogTitle>
					<DialogDescription>
						Update certain settings using a json object.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-permissions"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid  grid-cols-1 md:grid-cols-2  w-full gap-4"
					>
						<FormField
							control={form.control}
							name="healthCheckSwarm"
							render={({ field }) => (
								<FormItem className="relative">
									<FormLabel>Health Check</FormLabel>
									<FormDescription className="break-all">
										Check the interface
									</FormDescription>
									<FormControl>
										<Textarea
											className="font-mono [field-sizing:content;]"
											placeholder={`
                                                    `}
											{...field}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="restartPolicySwarm"
							render={({ field }) => (
								<FormItem className="relative">
									<FormLabel>Restart Policy</FormLabel>
									<FormDescription className="break-all">
										{/* {path} */}
										Check the interface
									</FormDescription>
									<FormControl>
										<Textarea
											className="font-mono [field-sizing:content;]"
											placeholder={`
                                                    `}
											{...field}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="placementSwarm"
							render={({ field }) => (
								<FormItem className="relative">
									<FormLabel>Placement</FormLabel>
									<FormDescription className="break-all">
										Check the interface
									</FormDescription>
									<FormControl>
										<Textarea
											className="font-mono [field-sizing:content;]"
											placeholder={`
                                                    `}
											{...field}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="updateConfigSwarm"
							render={({ field }) => (
								<FormItem className="relative">
									<FormLabel>Update Config</FormLabel>
									<FormDescription className="break-all">
										Check the interface
									</FormDescription>
									<FormControl>
										<Textarea
											className="font-mono [field-sizing:content;]"
											placeholder={`
                                                    `}
											{...field}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="rollbackConfigSwarm"
							render={({ field }) => (
								<FormItem className="relative">
									<FormLabel>Rollback Config</FormLabel>
									<FormDescription className="break-all">
										Check the interface
									</FormDescription>
									<FormControl>
										<Textarea
											className="font-mono [field-sizing:content;]"
											placeholder={`
                                                    `}
											{...field}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="modeSwarm"
							render={({ field }) => (
								<FormItem className="relative">
									<FormLabel>Mode</FormLabel>
									<FormDescription className="break-all">
										Check the interface
									</FormDescription>
									<FormControl>
										<Textarea
											className="font-mono [field-sizing:content;]"
											placeholder={`
                                                    `}
											{...field}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="labelsSwarm"
							render={({ field }) => (
								<FormItem className="relative">
									<FormLabel>Labels</FormLabel>
									<FormDescription className="break-all">
										Check the interface
									</FormDescription>
									<FormControl>
										<Textarea
											className="font-mono [field-sizing:content;]"
											placeholder={`
                                                    `}
											{...field}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>

						<DialogFooter className="flex w-full flex-row justify-end md:col-span-2">
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
