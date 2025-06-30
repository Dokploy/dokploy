import { AlertBlock } from "@/components/shared/alert-block";
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
import type { CacheType } from "../domains/handle-domain";
import { commonCronExpressions } from "../schedules/handle-schedules";

const formSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		cronExpression: z.string().min(1, "Cron expression is required"),
		volumeName: z.string(),
		hostPath: z.string(),
		prefix: z.string(),
		keepLatestCount: z.coerce.number().optional(),
		turnOff: z.boolean().default(false),
		volumeBackupType: z.enum(["bind", "volume"]),
		enabled: z.boolean().default(true),
		serviceName: z.string(),
		destinationId: z.string().min(1, "Destination required"),
		scheduleType: z.enum([
			"application",
			"compose",
			"postgres",
			"mariadb",
			"mongo",
			"mysql",
			"redis",
		]),
	})
	.superRefine((data, ctx) => {
		if (data.scheduleType === "compose" && !data.serviceName) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Service name is required",
				path: ["serviceName"],
			});
		}
	});

interface Props {
	id?: string;
	volumeBackupId?: string;
	volumeBackupType?:
		| "application"
		| "compose"
		| "postgres"
		| "mariadb"
		| "mongo"
		| "mysql"
		| "redis";
}

export const HandleVolumeBackups = ({
	id,
	volumeBackupId,
	volumeBackupType,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");

	const utils = api.useUtils();
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			cronExpression: "",
			volumeName: "",
			hostPath: "",
			prefix: "",
			keepLatestCount: undefined,
			turnOff: false,
			volumeBackupType: "volume",
			enabled: true,
			serviceName: "",
		},
	});

	const scheduleTypeForm = form.watch("scheduleType");

	const { data: volumeBackup } = api.volumeBackups.one.useQuery(
		{ volumeBackupId: volumeBackupId || "" },
		{ enabled: !!volumeBackupId },
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
			enabled: !!id && volumeBackupType === "compose",
		},
	);

	useEffect(() => {
		if (volumeBackupId && volumeBackup) {
			form.reset({
				name: volumeBackup.name,
				cronExpression: volumeBackup.cronExpression,
				volumeName: volumeBackup.volumeName || "",
				hostPath: volumeBackup.hostPath || "",
				prefix: volumeBackup.prefix,
				keepLatestCount: volumeBackup.keepLatestCount,
				turnOff: volumeBackup.turnOff,
				volumeBackupType: volumeBackup.type,
				enabled: volumeBackup.enabled,
				serviceName: volumeBackup.serviceName || "",
				destinationId: volumeBackup.destinationId,
			});
		}
	}, [form, volumeBackup, volumeBackupId]);

	const { mutateAsync, isLoading } = volumeBackupId
		? api.volumeBackups.update.useMutation()
		: api.volumeBackups.create.useMutation();

	const onSubmit = async (values: z.infer<typeof formSchema>) => {
		if (!id && !volumeBackupId) return;

		await mutateAsync({
			...values,
			destinationId: values.destinationId,
			volumeBackupId: volumeBackupId || "",
			...(volumeBackupType === "application" && {
				applicationId: id || "",
			}),
			...(volumeBackupType === "compose" && {
				composeId: id || "",
			}),
			...(volumeBackupType === "postgres" && {
				serverId: id || "",
			}),
			...(volumeBackupType === "postgres" && {
				postgresId: id || "",
			}),
			...(volumeBackupType === "mariadb" && {
				mariadbId: id || "",
			}),
			...(volumeBackupType === "mongo" && {
				mongoId: id || "",
			}),
			...(volumeBackupType === "mysql" && {
				mysqlId: id || "",
			}),
			...(volumeBackupType === "redis" && {
				redisId: id || "",
			}),
		})
			.then(() => {
				toast.success(
					`Volume backup ${volumeBackupId ? "updated" : "created"} successfully`,
				);
				utils.volumeBackups.list.invalidate({
					id,
					volumeBackupType,
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
				{volumeBackupId ? (
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
						Add Volume Backup
					</Button>
				)}
			</DialogTrigger>
			<DialogContent
				className={cn(
					"max-h-screen overflow-y-auto",
					volumeBackupType === "compose" || volumeBackupType === "application"
						? "max-h-[95vh] sm:max-w-2xl"
						: " sm:max-w-lg",
				)}
			>
				<DialogHeader>
					<DialogTitle>
						{volumeBackupId ? "Edit" : "Create"} Volume Backup
					</DialogTitle>
					<DialogDescription>
						Create a volume backup to backup your volume to a destination
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
							{volumeBackupId ? "Update" : "Create"} Volume Backup
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
