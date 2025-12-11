import { zodResolver } from "@hookform/resolvers/zod";
import {
	DatabaseZap,
	Info,
	PenBoxIcon,
	PlusCircle,
	RefreshCw,
} from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { type Control, useForm } from "react-hook-form";
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
	{ labelKey: "schedules.form.commonCron.everyMinute", value: "* * * * *" },
	{ labelKey: "schedules.form.commonCron.everyHour", value: "0 * * * *" },
	{
		labelKey: "schedules.form.commonCron.everyDayMidnight",
		value: "0 0 * * *",
	},
	{
		labelKey: "schedules.form.commonCron.everySundayMidnight",
		value: "0 0 * * 0",
	},
	{
		labelKey: "schedules.form.commonCron.everyMonthFirstMidnight",
		value: "0 0 1 * *",
	},
	{
		labelKey: "schedules.form.commonCron.every15Minutes",
		value: "*/15 * * * *",
	},
	{
		labelKey: "schedules.form.commonCron.everyWeekdayMidnight",
		value: "0 0 * * 1-5",
	},
	{ labelKey: "schedules.form.commonCron.custom", value: "custom" },
];

const createFormSchema = (t: (key: string) => string) =>
	z
		.object({
			name: z.string().min(1, t("schedules.validation.nameRequired")),
			cronExpression: z
				.string()
				.min(1, t("schedules.validation.cronExpressionRequired")),
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
					message: t("schedules.validation.serviceNameRequired"),
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
					message: t("schedules.validation.scriptRequired"),
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
					message: t("schedules.validation.commandRequired"),
					path: ["command"],
				});
			}
		});

interface Props {
	id?: string;
	scheduleId?: string;
	scheduleType?: "application" | "compose" | "server" | "dokploy-server";
}

export const ScheduleFormField = ({
	name,
	formControl,
}: {
	name: string;
	formControl: Control<any>;
}) => {
	const { t } = useTranslation("common");
	const [selectedOption, setSelectedOption] = useState("");

	return (
		<FormField
			control={formControl}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel className="flex items-center gap-2">
						{t("schedules.form.scheduleLabel")}
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Info className="w-4 h-4 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent>
									<p>{t("schedules.form.scheduleTooltip.format")}</p>
									<p>{t("schedules.form.scheduleTooltip.example")}</p>
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
										placeholder={t(
											"schedules.form.schedulePredefinedPlaceholder",
										)}
									/>
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								{commonCronExpressions.map((expr) => (
									<SelectItem key={expr.value} value={expr.value}>
										{t(expr.labelKey)}
										{expr.value !== "custom" && ` (${expr.value})`}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="relative">
							<FormControl>
								<Input
									placeholder={t(
										"schedules.form.scheduleCustomPlaceholder",
									)}
									{...field}
									onChange={(e) => {
										const value = e.target.value;
										const commonExpression = commonCronExpressions.find(
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
					<FormDescription>
						{t("schedules.form.scheduleDescription")}
					</FormDescription>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
};

export const HandleSchedules = ({ id, scheduleId, scheduleType }: Props) => {
	const { t } = useTranslation("common");
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const utils = api.useUtils();
	const formSchema = createFormSchema(t);
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
					scheduleId
						? t("schedules.toast.updateSuccess")
						: t("schedules.toast.createSuccess"),
				);
				utils.schedule.list.invalidate({
					id,
					scheduleType,
				});
				setIsOpen(false);
			})
			.catch((error) => {
				toast.error(
					error instanceof Error
						? error.message
						: t("common.unknownError"),
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
						{t("schedules.button.add")}
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
							?t("schedules.dialog.updateTitle")
							:t("schedules.dialog.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("schedules.dialog.description")}
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
											<FormLabel>
												{t("schedules.form.serviceNameLabel")}
											</FormLabel>
											<div className="flex gap-2">
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue
																placeholder={t(
																	"schedules.form.serviceNamePlaceholder",
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
															{t("schedules.form.serviceNameEmpty")}
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
																{t("schedules.form.fetchTooltip")}
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
																{t("schedules.form.cacheTooltip")}
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
										{t("schedules.form.taskNameLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t("schedules.form.taskNamePlaceholder")}
											{...field}
										/>
									</FormControl>
									<FormDescription>
										{t("schedules.form.taskNameDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<ScheduleFormField
							name="cronExpression"
							formControl={form.control}
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
												{t("schedules.form.shellTypeLabel")}
											</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue
															placeholder={t(
																"schedules.form.shellTypePlaceholder",
															)}
														/>
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="bash">
														{t("schedules.form.shellType.option.bash")}
													</SelectItem>
													<SelectItem value="sh">
														{t("schedules.form.shellType.option.sh")}
													</SelectItem>
												</SelectContent>
											</Select>
											<FormDescription>
												{t("schedules.form.shellTypeDescription")}
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
												{t("schedules.form.commandLabel")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t("schedules.form.commandPlaceholder")}
													{...field}
												/>
											</FormControl>
											<FormDescription>
												{t("schedules.form.commandDescription")}
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
										<FormLabel>
											{t("schedules.form.scriptLabel")}
										</FormLabel>
										<FormControl>
											<FormControl>
												<CodeEditor
													language="shell"
													placeholder={t("schedules.form.scriptPlaceholder")}
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
										{t("schedules.form.enabledLabel")}
									</FormLabel>
								</FormItem>
							)}
						/>

						<Button type="submit" isLoading={isLoading} className="w-full">
							{scheduleId
								? t("schedules.form.submit.update")
								: t("schedules.form.submit.create")}
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
