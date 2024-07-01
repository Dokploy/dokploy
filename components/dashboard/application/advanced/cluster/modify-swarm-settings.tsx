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
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { HelpCircle, Settings, Loader2 } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CodeEditor } from "@/components/shared/code-editor";

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
	networkSwarm: createStringToJSONSchema(NetworkSwarmSchema).nullable(),
});

type AddSwarmSettings = z.infer<typeof addSwarmSettings>;

interface Props {
	applicationId: string;
}

export const AddSwarmSettings = ({ applicationId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const { data, isLoading } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: isOpen },
	);

	const { mutateAsync, isError, error } = api.application.update.useMutation();

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
		},
		resolver: zodResolver(addSwarmSettings),
	});

	useEffect(() => {
		if (data && isOpen) {
			form.reset({
				healthCheckSwarm: data.healthCheckSwarm
					? JSON.stringify(data.healthCheckSwarm, null, 2)
					: null,
				restartPolicySwarm: data.restartPolicySwarm
					? JSON.stringify(data.restartPolicySwarm, null, 2)
					: null,
				placementSwarm: data.placementSwarm
					? JSON.stringify(data.placementSwarm, null, 2)
					: null,
				updateConfigSwarm: data.updateConfigSwarm
					? JSON.stringify(data.updateConfigSwarm, null, 2)
					: null,
				rollbackConfigSwarm: data.rollbackConfigSwarm
					? JSON.stringify(data.rollbackConfigSwarm, null, 2)
					: null,
				modeSwarm: data.modeSwarm
					? JSON.stringify(data.modeSwarm, null, 2)
					: null,
				labelsSwarm: data.labelsSwarm
					? JSON.stringify(data.labelsSwarm, null, 2)
					: null,
				networkSwarm: data.networkSwarm
					? JSON.stringify(data.networkSwarm, null, 2)
					: null,
			});
		}
	}, [form.reset, data, isOpen]);

	const onSubmit = async (data: AddSwarmSettings) => {
		await mutateAsync({
			applicationId,
			healthCheckSwarm: data.healthCheckSwarm,
			restartPolicySwarm: data.restartPolicySwarm,
			placementSwarm: data.placementSwarm,
			updateConfigSwarm: data.updateConfigSwarm,
			rollbackConfigSwarm: data.rollbackConfigSwarm,
			modeSwarm: data.modeSwarm,
			labelsSwarm: data.labelsSwarm,
			networkSwarm: data.networkSwarm,
		})
			.then(() => {
				toast.success("Swarm settings updated");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to update the swarm settings");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="secondary" className="cursor-pointer w-fit">
					<Settings className="size-4 text-muted-foreground" />
					Swarm Settings
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh]  overflow-y-auto sm:max-w-5xl p-0">
				<DialogHeader className="p-6">
					<DialogTitle className="flex items-center space-x-2">
						<div>Swarm Settings</div>
						{isLoading && (
							<Loader2 className="inline-block w-4 h-4 animate-spin" />
						)}
					</DialogTitle>
					<DialogDescription>
						Update certain settings using a json object.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form-add-permissions"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid  grid-cols-1 md:grid-cols-2  w-full gap-4 relative"
					>
						<FormField
							control={form.control}
							name="healthCheckSwarm"
							render={({ field }) => (
								<FormItem className="relative max-lg:px-4 lg:pl-6 ">
									<FormLabel>Health Check</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Check the interface
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

									<FormControl>
										<CodeEditor
											language="json"
											placeholder={`{
	"Test" : ["CMD-SHELL", "curl -f http://localhost:3000/health"],
	"Interval" : 10000,
	"Timeout" : 10000,
	"StartPeriod" : 10000,
	"Retries" : 10
}`}
											className="h-[12rem] font-mono"
											{...field}
											value={field?.value || ""}
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
								<FormItem className="relative  max-lg:px-4 lg:pr-6 ">
									<FormLabel>Restart Policy</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Check the interface
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

									<FormControl>
										<CodeEditor
											language="json"
											placeholder={`{
	"Condition" : "on-failure",
	"Delay" : 10000,
	"MaxAttempts" : 10,
	"Window" : 10000
}                                                  `}
											className="h-[12rem] font-mono"
											{...field}
											value={field?.value || ""}
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
								<FormItem className="relative   max-lg:px-4 lg:pl-6 ">
									<FormLabel>Placement</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Check the interface
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
	Platforms?:
		| Array<{
				Architecture: string;
				OS: string;
		  }>
		| undefined;
}`}
													</pre>
												</code>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>

									<FormControl>
										<CodeEditor
											language="json"
											placeholder={`{
	"Constraints" : ["node.role==manager"],
	"Preferences" : [{
		"Spread" : {
			"SpreadDescriptor" : "node.labels.region"
		}
	}],
	"MaxReplicas" : 10,
	"Platforms" : [{
		"Architecture" : "amd64",
		"OS" : "linux"
	}]
}                                                `}
											className="h-[21rem] font-mono"
											{...field}
											value={field?.value || ""}
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
								<FormItem className="relative  max-lg:px-4 lg:pr-6 ">
									<FormLabel>Update Config</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Check the interface
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

									<FormControl>
										<CodeEditor
											language="json"
											placeholder={`{
	"Parallelism" : 1,
	"Delay" : 10000,
	"FailureAction" : "continue",
	"Monitor" : 10000,
	"MaxFailureRatio" : 10,
	"Order" : "start-first"
}`}
											className="h-[21rem] font-mono"
											{...field}
											value={field?.value || ""}
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
								<FormItem className="relative  max-lg:px-4 lg:pl-6 ">
									<FormLabel>Rollback Config</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Check the interface
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

									<FormControl>
										<CodeEditor
											language="json"
											placeholder={`{
	"Parallelism" : 1,
	"Delay" : 10000,
	"FailureAction" : "continue",
	"Monitor" : 10000,
	"MaxFailureRatio" : 10,
	"Order" : "start-first"
}`}
											className="h-[17rem] font-mono"
											{...field}
											value={field?.value || ""}
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
								<FormItem className="relative  max-lg:px-4 lg:pr-6 ">
									<FormLabel>Mode</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Check the interface
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
	ReplicatedJob?:
		| {
				MaxConcurrent?: number | undefined;
				TotalCompletions?: number | undefined;
		  }
		| undefined;
	GlobalJob?: {} | undefined;
}`}
													</pre>
												</code>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>

									<FormControl>
										<CodeEditor
											language="json"
											placeholder={`{
	"Replicated" : {
		"Replicas" : 1
	},
	"Global" : {},
	"ReplicatedJob" : {
		"MaxConcurrent" : 1,
		"TotalCompletions" : 1
	},
	"GlobalJob" : {}
}`}
											className="h-[17rem] font-mono"
											{...field}
											value={field?.value || ""}
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
							name="networkSwarm"
							render={({ field }) => (
								<FormItem className="relative max-lg:px-4 lg:pl-6 ">
									<FormLabel>Network</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Check the interface
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
										<CodeEditor
											language="json"
											placeholder={`[
 {
	"Target" : "dokploy-network",
	"Aliases" : ["dokploy-network"],
	"DriverOpts" : {
		"com.docker.network.driver.mtu" : "1500",
		"com.docker.network.driver.host_binding" : "true",
		"com.docker.network.driver.mtu" : "1500",
		"com.docker.network.driver.host_binding" : "true"
	}
 }
]`}
											className="h-[20rem] font-mono"
											{...field}
											value={field?.value || ""}
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
								<FormItem className="relative max-lg:px-4 lg:pr-6 ">
									<FormLabel>Labels</FormLabel>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<FormDescription className="break-all w-fit flex flex-row gap-1 items-center">
													Check the interface
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
										<CodeEditor
											language="json"
											placeholder={`{
	"com.example.app.name" : "my-app",
	"com.example.app.version" : "1.0.0"
}`}
											className="h-[20rem] font-mono"
											{...field}
											value={field?.value || ""}
										/>
									</FormControl>
									<pre>
										<FormMessage />
									</pre>
								</FormItem>
							)}
						/>

						<DialogFooter className="flex w-full flex-row justify-end md:col-span-2 m-0 sticky bottom-0 right-0 bg-muted border p-2 ">
							<Button
								isLoading={form.formState.isSubmitting}
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
