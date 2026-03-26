import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
	CheckIcon,
	ChevronsUpDown,
	DatabaseZap,
	Info,
	PenBoxIcon,
	PlusCircle,
	RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
	type Control,
	type FieldValues,
	type Path,
	useForm,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
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
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { getTimezoneLabel, TIMEZONES } from "./timezones";

const CRON_PRESET_DEFS = [
	{ value: "* * * * *", presetKey: "everyMinute" },
	{ value: "0 * * * *", presetKey: "everyHour" },
	{ value: "0 0 * * *", presetKey: "everyDayMidnight" },
	{ value: "0 0 * * 0", presetKey: "everySundayMidnight" },
	{ value: "0 0 1 * *", presetKey: "monthlyFirstMidnight" },
	{ value: "*/15 * * * *", presetKey: "every15Minutes" },
	{ value: "0 0 * * 1-5", presetKey: "weekdayMidnight" },
	{ value: "custom", presetKey: "custom" },
] as const;

type CronPresetKey = (typeof CRON_PRESET_DEFS)[number]["presetKey"];

const createScheduleFormSchema = (
	t: ReturnType<typeof useTranslations<"applicationSchedules">>,
) =>
	z
		.object({
			name: z.string().min(1, t("forms.validation.nameRequired")),
			cronExpression: z.string().min(1, t("forms.validation.cronRequired")),
			shellType: z.enum(["bash", "sh"]),
			command: z.string(),
			enabled: z.boolean(),
			serviceName: z.string(),
			scheduleType: z.enum([
				"application",
				"compose",
				"server",
				"dokploy-server",
			]),
			script: z.string(),
			timezone: z.string().optional(),
		})
		.superRefine((data, ctx) => {
			if (data.scheduleType === "compose" && !data.serviceName) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: t("forms.validation.serviceNameRequired"),
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
					message: t("forms.validation.scriptRequired"),
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
					message: t("forms.validation.commandRequired"),
					path: ["command"],
				});
			}
		});

type ScheduleFormValues = z.infer<ReturnType<typeof createScheduleFormSchema>>;

interface Props {
	id?: string;
	scheduleId?: string;
	scheduleType?: "application" | "compose" | "server" | "dokploy-server";
}

export const ScheduleFormField = <T extends FieldValues>({
	name,
	formControl,
}: {
	name: Path<T>;
	formControl: Control<T>;
}) => {
	const t = useTranslations("applicationSchedules");
	const [selectedOption, setSelectedOption] = useState("");

	const presetLabels = useMemo(
		(): Record<CronPresetKey, string> => ({
			everyMinute: t("forms.presets.everyMinute"),
			everyHour: t("forms.presets.everyHour"),
			everyDayMidnight: t("forms.presets.everyDayMidnight"),
			everySundayMidnight: t("forms.presets.everySundayMidnight"),
			monthlyFirstMidnight: t("forms.presets.monthlyFirstMidnight"),
			every15Minutes: t("forms.presets.every15Minutes"),
			weekdayMidnight: t("forms.presets.weekdayMidnight"),
			custom: t("forms.presets.custom"),
		}),
		[t],
	);

	return (
		<FormField
			control={formControl}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel className="flex items-center gap-2">
						{t("forms.scheduleLabel")}
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Info className="w-4 h-4 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent>
									<p>{t("forms.scheduleTooltipLine1")}</p>
									<p>{t("forms.scheduleTooltipLine2")}</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</FormLabel>
					<div className="flex flex-col gap-2">
						<Select
							value={selectedOption}
							onValueChange={(value) => {
								setSelectedOption(value);
								field.onChange(value === "custom" ? "" : value);
							}}
						>
							<FormControl>
								<SelectTrigger>
									<SelectValue
										placeholder={t("forms.selectPresetPlaceholder")}
									/>
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								{CRON_PRESET_DEFS.map((expr) => (
									<SelectItem key={expr.value} value={expr.value}>
										{presetLabels[expr.presetKey]}
										{expr.value !== "custom" && ` (${expr.value})`}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="relative">
							<FormControl>
								<Input
									placeholder={t("forms.customCronPlaceholder")}
									{...field}
									onChange={(e) => {
										const value = e.target.value;
										const commonExpression = CRON_PRESET_DEFS.find(
											(expression) => expression.value === value,
										);
										if (commonExpression) {
											setSelectedOption(commonExpression.value);
										} else {
											setSelectedOption("custom");
										}
										field.onChange(e);
									}}
								/>
							</FormControl>
						</div>
					</div>
					<FormDescription>{t("forms.scheduleDescription")}</FormDescription>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
};

export const HandleSchedules = ({ id, scheduleId, scheduleType }: Props) => {
	const t = useTranslations("applicationSchedules");
	const scheduleFormSchema = useMemo(() => createScheduleFormSchema(t), [t]);

	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const utils = api.useUtils();
	const form = useForm<ScheduleFormValues>({
		resolver: standardSchemaResolver(scheduleFormSchema),
		defaultValues: {
			name: "",
			cronExpression: "",
			shellType: "bash",
			command: "",
			enabled: true,
			serviceName: "",
			scheduleType: scheduleType || "application",
			script: "",
			timezone: undefined,
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
				timezone: schedule.timezone || undefined,
			});
		}
	}, [form, schedule, scheduleId]);

	const { mutateAsync, isPending } = scheduleId
		? api.schedule.update.useMutation()
		: api.schedule.create.useMutation();

	const onSubmit = async (values: ScheduleFormValues) => {
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
					scheduleId ? t("forms.toastUpdated") : t("forms.toastCreated"),
				);
				utils.schedule.list.invalidate({
					id,
					scheduleType,
				});
				setIsOpen(false);
			})
			.catch((error: unknown) => {
				toast.error(
					error instanceof Error ? error.message : t("forms.toastUnknownError"),
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
						{t("forms.addSchedule")}
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
					<DialogTitle>
						{scheduleId
							? t("forms.dialogTitleEdit")
							: t("forms.dialogTitleCreate")}
					</DialogTitle>
					<DialogDescription>
						{scheduleId
							? t("forms.dialogDescriptionEdit")
							: t("forms.dialogDescriptionCreate")}
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
											<FormLabel>{t("forms.serviceName")}</FormLabel>
											<div className="flex gap-2">
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue
																placeholder={t(
																	"forms.selectServicePlaceholder",
																)}
															/>
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
															{t("forms.serviceEmpty")}
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
															<p>{t("forms.fetchTooltip")}</p>
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
															<p>{t("forms.cacheTooltip")}</p>
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
										{t("forms.taskName")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t("forms.taskNamePlaceholder")}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										{t("forms.taskNameDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<ScheduleFormField
							name="cronExpression"
							formControl={form.control}
						/>

						<FormField
							control={form.control}
							name="timezone"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										{t("forms.timezoneLabel")}
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<Info className="w-4 h-4 text-muted-foreground cursor-help" />
												</TooltipTrigger>
												<TooltipContent>
													<p>{t("forms.timezoneTooltip")}</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</FormLabel>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													className={cn(
														"w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													{getTimezoneLabel(field.value, t("forms.utcDefault"))}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="w-[400px] p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t("forms.timezoneSearchPlaceholder")}
													className="h-9"
												/>
												<CommandList>
													<CommandEmpty>
														{t("forms.timezoneEmpty")}
													</CommandEmpty>
													<ScrollArea className="h-72">
														{Object.entries(TIMEZONES).map(
															([region, zones]) => (
																<CommandGroup key={region} heading={region}>
																	{zones.map((tz) => (
																		<CommandItem
																			key={tz.value}
																			value={`${region} ${tz.label} ${tz.value}`}
																			onSelect={() => {
																				field.onChange(tz.value);
																			}}
																		>
																			{tz.value}
																			<CheckIcon
																				className={cn(
																					"ml-auto h-4 w-4",
																					field.value === tz.value
																						? "opacity-100"
																						: "opacity-0",
																				)}
																			/>
																		</CommandItem>
																	))}
																</CommandGroup>
															),
														)}
													</ScrollArea>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
									<FormDescription>
										{t("forms.timezoneDescription")}
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
												{t("forms.shellType")}
											</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t("forms.selectShellPlaceholder")}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="bash">Bash</SelectItem>
													<SelectItem value="sh">Sh</SelectItem>
												</SelectContent>
											</Select>
											<FormDescription>
												{t("forms.shellDescription")}
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
												{t("forms.command")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t("forms.commandPlaceholder")}
													{...field}
												/>
											</FormControl>
											<FormDescription>
												{t("forms.commandDescription")}
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
										<FormLabel>{t("forms.script")}</FormLabel>
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
										{t("forms.enabledLabel")}
									</FormLabel>
								</FormItem>
							)}
						/>

						<Button type="submit" isLoading={isPending} className="w-full">
							{scheduleId ? t("forms.submitUpdate") : t("forms.submitCreate")}
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
