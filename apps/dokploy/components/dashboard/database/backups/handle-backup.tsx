import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
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
import { zodResolver } from "@hookform/resolvers/zod";
import {
	DatabaseZap,
	Info,
	PenBoxIcon,
	PlusIcon,
	RefreshCw,
} from "lucide-react";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { commonCronExpressions } from "../../application/schedules/handle-schedules";

type CacheType = "cache" | "fetch";

type DatabaseType = "postgres" | "mariadb" | "mysql" | "mongo" | "web-server";

const createSchema = (t: any) =>
	z
		.object({
			destinationId: z
				.string()
				.min(1, t("dashboard.backups.destinationRequired")),
			schedule: z.string().min(1, t("dashboard.backups.scheduleRequired")),
			prefix: z.string().min(1, t("dashboard.backups.prefixRequired")),
			enabled: z.boolean(),
			database: z.string().min(1, t("dashboard.backups.databaseRequired")),
			keepLatestCount: z.coerce.number().optional(),
			serviceName: z.string().nullable(),
			databaseType: z
				.enum(["postgres", "mariadb", "mysql", "mongo", "web-server"])
				.optional(),
			backupType: z.enum(["database", "compose"]),
			metadata: z
				.object({
					postgres: z
						.object({
							databaseUser: z.string(),
						})
						.optional(),
					mariadb: z
						.object({
							databaseUser: z.string(),
							databasePassword: z.string(),
						})
						.optional(),
					mongo: z
						.object({
							databaseUser: z.string(),
							databasePassword: z.string(),
						})
						.optional(),
					mysql: z
						.object({
							databaseRootPassword: z.string(),
						})
						.optional(),
				})
				.optional(),
		})
		.superRefine((data, ctx) => {
			if (data.backupType === "compose" && !data.databaseType) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: t("dashboard.backups.databaseTypeRequired"),
					path: ["databaseType"],
				});
			}

			if (data.backupType === "compose" && !data.serviceName) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: t("dashboard.backups.serviceNameRequired"),
					path: ["serviceName"],
				});
			}

			if (data.backupType === "compose" && data.databaseType) {
				if (data.databaseType === "postgres") {
					if (!data.metadata?.postgres?.databaseUser) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t("dashboard.backups.databaseUserRequiredPostgres"),
							path: ["metadata", "postgres", "databaseUser"],
						});
					}
				} else if (data.databaseType === "mariadb") {
					if (!data.metadata?.mariadb?.databaseUser) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t("dashboard.backups.databaseUserRequiredMariaDB"),
							path: ["metadata", "mariadb", "databaseUser"],
						});
					}
					if (!data.metadata?.mariadb?.databasePassword) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t("dashboard.backups.databasePasswordRequiredMariaDB"),
							path: ["metadata", "mariadb", "databasePassword"],
						});
					}
				} else if (data.databaseType === "mongo") {
					if (!data.metadata?.mongo?.databaseUser) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t("dashboard.backups.databaseUserRequiredMongoDB"),
							path: ["metadata", "mongo", "databaseUser"],
						});
					}
					if (!data.metadata?.mongo?.databasePassword) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t("dashboard.backups.databasePasswordRequiredMongoDB"),
							path: ["metadata", "mongo", "databasePassword"],
						});
					}
				} else if (data.databaseType === "mysql") {
					if (!data.metadata?.mysql?.databaseRootPassword) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t("dashboard.backups.rootPasswordRequiredMySQL"),
							path: ["metadata", "mysql", "databaseRootPassword"],
						});
					}
				}
			}
		});

interface Props {
	id?: string;
	backupId?: string;
	databaseType?: DatabaseType;
	refetch: () => void;
	backupType: "database" | "compose";
}

export const HandleBackup = ({
	id,
	backupId,
	databaseType = "postgres",
	refetch,
	backupType = "database",
}: Props) => {
	const { t } = useTranslation("dashboard");
	const [isOpen, setIsOpen] = useState(false);

	const { data, isLoading } = api.destination.all.useQuery();
	const { data: backup } = api.backup.one.useQuery(
		{
			backupId: backupId ?? "",
		},
		{
			enabled: !!backupId,
		},
	);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const { mutateAsync: createBackup, isLoading: isCreatingPostgresBackup } =
		backupId
			? api.backup.update.useMutation()
			: api.backup.create.useMutation();

	const form = useForm<z.infer<ReturnType<typeof createSchema>>>({
		defaultValues: {
			database: databaseType === "web-server" ? "dokploy" : "",
			destinationId: "",
			enabled: true,
			prefix: "/",
			schedule: "",
			keepLatestCount: undefined,
			serviceName: null,
			databaseType: backupType === "compose" ? undefined : databaseType,
			backupType: backupType,
			metadata: {},
		},
		resolver: zodResolver(createSchema(t)),
	});

	const {
		data: services,
		isFetching: isLoadingServices,
		error: errorServices,
		refetch: refetchServices,
	} = api.compose.loadServices.useQuery(
		{
			composeId: backup?.composeId ?? id ?? "",
			type: cacheType,
		},
		{
			retry: false,
			refetchOnWindowFocus: false,
			enabled: backupType === "compose" && !!backup?.composeId && !!id,
		},
	);

	useEffect(() => {
		form.reset({
			database: backup?.database
				? backup?.database
				: databaseType === "web-server"
					? "dokploy"
					: "",
			destinationId: backup?.destinationId ?? "",
			enabled: backup?.enabled ?? true,
			prefix: backup?.prefix ?? "/",
			schedule: backup?.schedule ?? "",
			keepLatestCount: backup?.keepLatestCount ?? undefined,
			serviceName: backup?.serviceName ?? null,
			databaseType: backup?.databaseType ?? databaseType,
			backupType: backup?.backupType ?? backupType,
			metadata: backup?.metadata ?? {},
		});
	}, [form, form.reset, backupId, backup]);

	const onSubmit = async (data: z.infer<ReturnType<typeof createSchema>>) => {
		const getDatabaseId =
			backupType === "compose"
				? {
						composeId: id,
					}
				: databaseType === "postgres"
					? {
							postgresId: id,
						}
					: databaseType === "mariadb"
						? {
								mariadbId: id,
							}
						: databaseType === "mysql"
							? {
									mysqlId: id,
								}
							: databaseType === "mongo"
								? {
										mongoId: id,
									}
								: databaseType === "web-server"
									? {
											userId: id,
										}
									: undefined;

		await createBackup({
			destinationId: data.destinationId,
			prefix: data.prefix,
			schedule: data.schedule,
			enabled: data.enabled,
			database: data.database,
			keepLatestCount: data.keepLatestCount ?? null,
			databaseType: data.databaseType || databaseType,
			serviceName: data.serviceName,
			...getDatabaseId,
			backupId: backupId ?? "",
			backupType,
			metadata: data.metadata,
		})
			.then(async () => {
				toast.success(
					t("dashboard.backups.backupUpdatedCreated", {
						action: backupId
							? t("dashboard.backups.updated")
							: t("dashboard.backups.created"),
					}),
				);
				refetch();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					t("dashboard.backups.errorUpdatingCreatingBackup", {
						action: backupId
							? t("dashboard.backups.updating")
							: t("dashboard.backups.creating"),
					}),
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{backupId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 size-8"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>
						<PlusIcon className="h-4 w-4" />
						{backupId
							? t("dashboard.backups.updateBackup")
							: t("dashboard.backups.createBackup")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{backupId
							? t("dashboard.backups.updateBackup")
							: t("dashboard.backups.createBackup")}
					</DialogTitle>
					<DialogDescription>
						{backupId
							? t("dashboard.backups.updateBackupDescription")
							: t("dashboard.backups.addBackupDescription")}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form-add-backup"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="grid grid-cols-1 gap-4">
							{errorServices && (
								<AlertBlock type="warning" className="[overflow-wrap:anywhere]">
									{errorServices?.message}
								</AlertBlock>
							)}
							{backupType === "compose" && (
								<FormField
									control={form.control}
									name="databaseType"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("dashboard.backups.databaseType")}
											</FormLabel>
											<Select
												value={field.value}
												onValueChange={(value) => {
													field.onChange(value as DatabaseType);
													form.setValue("metadata", {});
												}}
											>
												<SelectTrigger className="w-full">
													<SelectValue
														placeholder={t(
															"dashboard.backups.selectDatabaseType",
														)}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="postgres">PostgreSQL</SelectItem>
													<SelectItem value="mariadb">MariaDB</SelectItem>
													<SelectItem value="mysql">MySQL</SelectItem>
													<SelectItem value="mongo">MongoDB</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
							<FormField
								control={form.control}
								name="destinationId"
								render={({ field }) => (
									<FormItem className="">
										<FormLabel>{t("dashboard.backups.destination")}</FormLabel>
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
														{isLoading
															? t("dashboard.backups.loading")
															: field.value
																? data?.find(
																		(destination) =>
																			destination.destinationId === field.value,
																	)?.name
																: t("dashboard.backups.selectDestination")}

														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</FormControl>
											</PopoverTrigger>
											<PopoverContent className="p-0" align="start">
												<Command>
													<CommandInput
														placeholder={t(
															"dashboard.backups.searchDestination",
														)}
														className="h-9"
													/>
													{isLoading && (
														<span className="py-6 text-center text-sm">
															{t("dashboard.backups.loadingDestinations")}
														</span>
													)}
													<CommandEmpty>
														{t("dashboard.backups.noDestinationsFound")}
													</CommandEmpty>
													<ScrollArea className="h-64">
														<CommandGroup>
															{data?.map((destination) => (
																<CommandItem
																	value={destination.destinationId}
																	key={destination.destinationId}
																	onSelect={() => {
																		form.setValue(
																			"destinationId",
																			destination.destinationId,
																		);
																	}}
																>
																	{destination.name}
																	<CheckIcon
																		className={cn(
																			"ml-auto h-4 w-4",
																			destination.destinationId === field.value
																				? "opacity-100"
																				: "opacity-0",
																		)}
																	/>
																</CommandItem>
															))}
														</CommandGroup>
													</ScrollArea>
												</Command>
											</PopoverContent>
										</Popover>

										<FormMessage />
									</FormItem>
								)}
							/>
							{backupType === "compose" && (
								<div className="flex flex-row items-end w-full gap-4">
									<FormField
										control={form.control}
										name="serviceName"
										render={({ field }) => (
											<FormItem className="w-full">
												<FormLabel>
													{t("dashboard.backups.serviceName")}
												</FormLabel>
												<div className="flex gap-2">
													<Select
														onValueChange={field.onChange}
														value={field.value || undefined}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue
																	placeholder={t(
																		"dashboard.backups.selectServiceName",
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
															{(!services || services.length === 0) && (
																<SelectItem value="none" disabled>
																	{t("dashboard.backups.empty")}
																</SelectItem>
															)}
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
																<p>{t("dashboard.backups.fetchTooltip")}</p>
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
																<p>{t("dashboard.backups.cacheTooltip")}</p>
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
								name="database"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>{t("dashboard.backups.database")}</FormLabel>
											<FormControl>
												<Input
													disabled={databaseType === "web-server"}
													placeholder={t(
														"dashboard.backups.databasePlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="schedule"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel className="flex items-center gap-2">
												{t("dashboard.backups.schedule")}
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger asChild>
															<Info className="w-4 h-4 text-muted-foreground cursor-help" />
														</TooltipTrigger>
														<TooltipContent>
															<p>{t("dashboard.backups.cronFormat")}</p>
															<p>{t("dashboard.backups.cronExample")}</p>
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
															<SelectValue
																placeholder={t(
																	"dashboard.backups.selectPredefinedSchedule",
																)}
															/>
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														{commonCronExpressions.map((expr) => (
															<SelectItem key={expr.value} value={expr.value}>
																{t(
																	`dashboard.backups.cronLabel.${expr.label}`,
																	{ defaultValue: expr.label },
																)}{" "}
																({expr.value})
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<div className="relative">
													<FormControl>
														<Input
															placeholder={t(
																"dashboard.backups.customCronPlaceholder",
															)}
															{...field}
														/>
													</FormControl>
												</div>
											</div>
											<FormDescription>
												{t("dashboard.backups.scheduleDescription")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="prefix"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>
												{t("dashboard.backups.prefixDestination")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t("dashboard.backups.prefixPlaceholder")}
													{...field}
												/>
											</FormControl>
											<FormDescription>
												{t("dashboard.backups.prefixDescription")}
											</FormDescription>

											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="keepLatestCount"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>{t("dashboard.backups.keepLatest")}</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={t(
														"dashboard.backups.keepLatestPlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormDescription>
												{t("dashboard.backups.keepLatestDescription")}
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 ">
										<div className="space-y-0.5">
											<FormLabel>{t("dashboard.backups.enabled")}</FormLabel>
											<FormDescription>
												{t("dashboard.backups.enabledDescription")}
											</FormDescription>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
							{backupType === "compose" && (
								<>
									{form.watch("databaseType") === "postgres" && (
										<FormField
											control={form.control}
											name="metadata.postgres.databaseUser"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("dashboard.backups.databaseUser")}
													</FormLabel>
													<FormControl>
														<Input placeholder="postgres" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}

									{form.watch("databaseType") === "mariadb" && (
										<>
											<FormField
												control={form.control}
												name="metadata.mariadb.databaseUser"
												render={({ field }) => (
													<FormItem>
														<FormLabel>
															{t("dashboard.backups.databaseUser")}
														</FormLabel>
														<FormControl>
															<Input placeholder="mariadb" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="metadata.mariadb.databasePassword"
												render={({ field }) => (
													<FormItem>
														<FormLabel>
															{t("dashboard.backups.databasePassword")}
														</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder="••••••••"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</>
									)}

									{form.watch("databaseType") === "mongo" && (
										<>
											<FormField
												control={form.control}
												name="metadata.mongo.databaseUser"
												render={({ field }) => (
													<FormItem>
														<FormLabel>
															{t("dashboard.backups.databaseUser")}
														</FormLabel>
														<FormControl>
															<Input placeholder="mongo" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="metadata.mongo.databasePassword"
												render={({ field }) => (
													<FormItem>
														<FormLabel>
															{t("dashboard.backups.databasePassword")}
														</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder="••••••••"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</>
									)}

									{form.watch("databaseType") === "mysql" && (
										<FormField
											control={form.control}
											name="metadata.mysql.databaseRootPassword"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														{t("dashboard.backups.rootPassword")}
													</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="••••••••"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}
								</>
							)}
						</div>
						<DialogFooter>
							<Button
								isLoading={isCreatingPostgresBackup}
								form="hook-form-add-backup"
								type="submit"
							>
								{backupId
									? t("dashboard.backups.update")
									: t("dashboard.backups.create")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
