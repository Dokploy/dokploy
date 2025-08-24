import { zodResolver } from "@hookform/resolvers/zod";
import {
	DatabaseZap,
	Info,
	PenBoxIcon,
	PlusCircle,
	RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import type { CacheType } from "../domains/handle-domain";

export const commonCronExpressions = [
	{ label: "Every minute", value: "* * * * *" },
	{ label: "Every hour", value: "0 * * * *" },
	{ label: "Every day at midnight", value: "0 0 * * *" },
	{ label: "Every Sunday at midnight", value: "0 0 * * 0" },
	{ label: "Every month on the 1st at midnight", value: "0 0 1 * *" },
	{ label: "Every 15 minutes", value: "*/15 * * * *" },
	{ label: "Every weekday at midnight", value: "0 0 * * 1-5" },
];

const formSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		cronExpression: z.string().min(1, "Cron expression is required"),
		shellType: z.enum(["bash", "sh"]).default("bash"),
		command: z.string(),
		enabled: z.boolean().default(true),
		serviceName: z.string(),
		scheduleType: z.enum([
			"application",
			"compose",
			"server",
			"dokploy-server",
		]),
		script: z.string(),
	})
	.superRefine((data, ctx) => {
		if (data.scheduleType === "compose" && !data.serviceName) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Service name is required",
				path: ["serviceName"],
			});
		}

		if (
			(data.scheduleType === "dokploy-server" ||
				data.scheduleType === "server") &&
			!data.script
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Script is required",
				path: ["script"],
			});
		}

		if (
			(data.scheduleType === "application" ||
				data.scheduleType === "compose") &&
			!data.command
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Command is required",
				path: ["command"],
			});
		}
	});

interface Props {
	id?: string;
	scheduleId?: string;
	scheduleType?: "application" | "compose" | "server" | "dokploy-server";
}

export const HandleSchedules = ({ id, scheduleId, scheduleType }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");

	const utils = api.useUtils();
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			cronExpression: "",
			shellType: "bash",
			command: "",
			enabled: true,
			serviceName: "",
			scheduleType: scheduleType || "application",
			script: "",
		},
	});

	const scheduleTypeForm = form.watch("scheduleType");

	const { data: schedule } = api.schedule.one.useQuery(
		{ scheduleId: scheduleId || "" },
		{ enabled: !!scheduleId },
	);

	const {
		data: services,
		isFetching: isLoadingServices,
		error: errorServices,
		refetch: refetchServices,
	} = api.compose.loadServices.useQuery(
		{
			composeId: id || "",
			type: cacheType,
		},
		{
			retry: false,
			refetchOnWindowFocus: false,
			enabled: !!id && scheduleType === "compose",
		},
	);

	useEffect(() => {
		if (scheduleId && schedule) {
			form.reset({
				name: schedule.name,
				cronExpression: schedule.cronExpression,
				shellType: schedule.shellType,
				command: schedule.command,
				enabled: schedule.enabled,
				serviceName: schedule.serviceName || "",
				scheduleType: schedule.scheduleType,
				script: schedule.script || "",
			});
		}
	}, [form, schedule, scheduleId]);

	const { mutateAsync, isLoading } = scheduleId
		? api.schedule.update.useMutation()
		: api.schedule.create.useMutation();

	const onSubmit = async (values: z.infer<typeof formSchema>) => {
		if (!id && !scheduleId) return;

		await mutateAsync({
			...values,
			scheduleId: scheduleId || "",
			...(scheduleType === "application" && {
				applicationId: id || "",
			}),
			...(scheduleType === "compose" && {
				composeId: id || "",
			}),
			...(scheduleType === "server" && {
				serverId: id || "",
			}),
			...(scheduleType === "dokploy-server" && {
				userId: id || "",
			}),
		})
			.then(() => {
				toast.success(
					`Schedule ${scheduleId ? "updated" : "created"} successfully`,
				);
				utils.schedule.list.invalidate({
					id,
					scheduleType,
				});
				setIsOpen(false);
			})
			.catch((error) => {
				toast.error(
					error instanceof Error ? error.message : "An unknown error occurred",
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{scheduleId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>
						<PlusCircle className="w-4 h-4 mr-2" />
						Add Schedule
					</Button>
				)}
			</DialogTrigger>
			<DialogContent
				className={cn(
					scheduleTypeForm === "dokploy-server" || scheduleTypeForm === "server"
						? "sm:max-w-2xl"
						: "sm:max-w-lg",
				)}
			>
				<DialogHeader>
					<DialogTitle>{scheduleId ? "Edit" : "Create"} Schedule</DialogTitle>
					<DialogDescription>
						{scheduleId ? "Manage" : "Create"} a schedule to run a task at a
						specific time or interval.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						{scheduleTypeForm === "compose" && (
							<div className="flex flex-col w-full gap-4">
								{errorServices && (
									<AlertBlock
										type="warning"
										className="[overflow-wrap:anywhere]"
									>
										{errorServices?.message}
									</AlertBlock>
								)}
								<FormField
									control={form.control}
									name="serviceName"
									render={({ field }) => (
										<FormItem className="w-full">
											<FormLabel>Service Name</FormLabel>
											<div className="flex gap-2">
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="Select a service name" />
														</SelectTrigger>
													</FormControl>

													<SelectContent>
														{services?.map((service, index) => (
															<SelectItem
																value={service}
																key={`${service}-${index}`}
															>
																{service}
															</SelectItem>
														))}
														<SelectItem value="none" disabled>
															Empty
														</SelectItem>
													</SelectContent>
												</Select>
												<TooltipProvider delayDuration={0}>
													<Tooltip>
														<TooltipTrigger asChild>
															<Button
																variant="secondary"
																type="button"
																isLoading={isLoadingServices}
																onClick={() => {
																	if (cacheType === "fetch") {
																		refetchServices();
																	} else {
																		setCacheType("fetch");
																	}
																}}
															>
																<RefreshCw className="size-4 text-muted-foreground" />
															</Button>
														</TooltipTrigger>
														<TooltipContent
															side="left"
															sideOffset={5}
															className="max-w-[10rem]"
														>
															<p>
																Fetch: Will clone the repository and load the
																services
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
												<TooltipProvider delayDuration={0}>
													<Tooltip>
														<TooltipTrigger asChild>
															<Button
																variant="secondary"
																type="button"
																isLoading={isLoadingServices}
																onClick={() => {
																	if (cacheType === "cache") {
																		refetchServices();
																	} else {
																		setCacheType("cache");
																	}
																}}
															>
																<DatabaseZap className="size-4 text-muted-foreground" />
															</Button>
														</TooltipTrigger>
														<TooltipContent
															side="left"
															sideOffset={5}
															className="max-w-[10rem]"
														>
															<p>
																Cache: If you previously deployed this compose,
																it will read the services from the last
																deployment/fetch from the repository
															</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>

											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						)}

						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										Task Name
									</FormLabel>
									<FormControl>
										<Input placeholder="Daily Database Backup" {...field} />
									</FormControl>
									<FormDescription>
										A descriptive name for your scheduled task
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="cronExpression"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										Schedule
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<Info className="w-4 h-4 text-muted-foreground cursor-help" />
												</TooltipTrigger>
												<TooltipContent>
													<p>
														Cron expression format: minute hour day month
														weekday
													</p>
													<p>Example: 0 0 * * * (daily at midnight)</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</FormLabel>
									<div className="flex flex-col gap-2">
										<Select
											onValueChange={(value) => {
												field.onChange(value);
											}}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select a predefined schedule" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{commonCronExpressions.map((expr) => (
													<SelectItem key={expr.value} value={expr.value}>
														{expr.label} ({expr.value})
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<div className="relative">
											<FormControl>
												<Input
													placeholder="Custom cron expression (e.g., 0 0 * * *)"
													{...field}
												/>
											</FormControl>
										</div>
									</div>
									<FormDescription>
										Choose a predefined schedule or enter a custom cron
										expression
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{(scheduleTypeForm === "application" ||
							scheduleTypeForm === "compose") && (
							<>
								<FormField
									control={form.control}
									name="shellType"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="flex items-center gap-2">
												Shell Type
											</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select shell type" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="bash">Bash</SelectItem>
													<SelectItem value="sh">Sh</SelectItem>
												</SelectContent>
											</Select>
											<FormDescription>
												Choose the shell to execute your command
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="command"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="flex items-center gap-2">
												Command
											</FormLabel>
											<FormControl>
												<Input placeholder="npm run backup" {...field} />
											</FormControl>
											<FormDescription>
												The command to execute in your container
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							</>
						)}

						{(scheduleTypeForm === "dokploy-server" ||
							scheduleTypeForm === "server") && (
							<FormField
								control={form.control}
								name="script"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Script</FormLabel>
										<FormControl>
											<FormControl>
												<CodeEditor
													language="shell"
													placeholder={`# This is a comment
echo "Hello, world!"
`}
													className="h-96 font-mono"
													{...field}
												/>
											</FormControl>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<FormField
							control={form.control}
							name="enabled"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
										Enabled
									</FormLabel>
								</FormItem>
							)}
						/>

						<Button type="submit" isLoading={isLoading} className="w-full">
							{scheduleId ? "Update" : "Create"} Schedule
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
