import { zodResolver } from "@hookform/resolvers/zod";
import {
	CheckIcon,
	ChevronsUpDown,
	DatabaseZap,
	PenBoxIcon,
	PlusIcon,
	RefreshCw,
} from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { ScheduleFormField } from "../../application/schedules/handle-schedules";

type CacheType = "cache" | "fetch";

type DatabaseType = "postgres" | "mariadb" | "mysql" | "mongo" | "web-server";

const createBackupSchema = (t: (key: string) => string) =>
	z
		.object({
			destinationId: z
				.string()
				.min(1, t("backups.restore.validation.destinationRequired")),
			schedule: z
				.string()
				.min(1, t("backups.handle.validation.scheduleRequired")),
			prefix: z
				.string()
				.min(1, t("backups.handle.validation.prefixRequired")),
			enabled: z.boolean(),
			database: z
				.string()
				.min(1, t("backups.restore.validation.databaseNameRequired")),
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
					message: t(
						"backups.restore.validation.databaseTypeRequiredForCompose",
					),
					path: ["databaseType"],
				});
			}

			if (data.backupType === "compose" && !data.serviceName) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: t(
						"backups.restore.validation.serviceNameRequiredForCompose",
					),
					path: ["serviceName"],
				});
			}

			if (data.backupType === "compose" && data.databaseType) {
				if (data.databaseType === "postgres") {
					if (!data.metadata?.postgres?.databaseUser) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t(
								"backups.restore.validation.postgresUserRequired",
							),
							path: ["metadata", "postgres", "databaseUser"],
						});
					}
				} else if (data.databaseType === "mariadb") {
					if (!data.metadata?.mariadb?.databaseUser) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t(
								"backups.restore.validation.mariadbUserRequired",
							),
							path: ["metadata", "mariadb", "databaseUser"],
						});
					}
					if (!data.metadata?.mariadb?.databasePassword) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t(
								"backups.restore.validation.mariadbPasswordRequired",
							),
							path: ["metadata", "mariadb", "databasePassword"],
						});
					}
				} else if (data.databaseType === "mongo") {
					if (!data.metadata?.mongo?.databaseUser) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t(
								"backups.restore.validation.mongoUserRequired",
							),
							path: ["metadata", "mongo", "databaseUser"],
						});
					}
					if (!data.metadata?.mongo?.databasePassword) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t(
								"backups.restore.validation.mongoPasswordRequired",
							),
							path: ["metadata", "mongo", "databasePassword"],
						});
					}
				} else if (data.databaseType === "mysql") {
					if (!data.metadata?.mysql?.databaseRootPassword) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: t(
								"backups.restore.validation.mysqlRootPasswordRequired",
							),
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
	const [isOpen, setIsOpen] = useState(false);
	const { t } = useTranslation("common");

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

	const form = useForm<z.infer<ReturnType<typeof createBackupSchema>>>({
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
		resolver: zodResolver(createBackupSchema(t)),
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

	const onSubmit = async (
		data: z.infer<ReturnType<typeof createBackupSchema>>,
	) => {
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
				if (backupId) {
					toast.success(t("backups.handle.toast.update.success"));
				} else {
					toast.success(t("backups.handle.toast.create.success"));
				}
				refetch();
				setIsOpen(false);
			})
			.catch(() => {
				if (backupId) {
					toast.error(t("backups.handle.toast.update.error"));
				} else {
					toast.error(t("backups.handle.toast.create.error"));
				}
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
						{t("backups.handle.button.create")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{backupId
							? t("backups.handle.dialog.update.title")
							: t("backups.handle.dialog.create.title")}
					</DialogTitle>
					<DialogDescription>
						{backupId
							? t("backups.handle.dialog.update.description")
							: t("backups.handle.dialog.create.description")}
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
												{t("backups.restore.field.databaseTypeLabel")}
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
															"backups.restore.field.databaseTypePlaceholder",
														)}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="postgres">
														{t("service.type.postgres")}
													</SelectItem>
													<SelectItem value="mariadb">
														{t("service.type.mariadb")}
													</SelectItem>
													<SelectItem value="mysql">
														{t("service.type.mysql")}
													</SelectItem>
													<SelectItem value="mongo">
														{t("service.type.mongo")}
													</SelectItem>
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
										<FormLabel>
											{t("backups.restore.field.destination")}
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
														{isLoading
															? t("loading")
															: field.value
																? data?.find(
																		(destination) =>
																			destination.destinationId === field.value,
																	)?.name
																: t(
																		"backups.restore.field.destinationPlaceholder",
																	)}

														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</FormControl>
											</PopoverTrigger>
											<PopoverContent className="p-0" align="start">
												<Command>
													<CommandInput
														placeholder={t(
															"backups.restore.field.destinationSearchPlaceholder",
														)}
														className="h-9"
													/>
													{isLoading && (
														<span className="py-6 text-center text-sm">
															{t("loading")}
														</span>
													)}
													<CommandEmpty>
														{t("backups.restore.field.destinationEmpty")}
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
													{t("backups.restore.field.serviceNameLabel")}
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
																		"backups.restore.field.serviceNamePlaceholder",
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
																	{t("backups.restore.field.serviceNameEmpty")}
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
																<p>
																	{t("backups.restore.tooltip.fetch")}
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
																	{t("backups.restore.tooltip.cache")}
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
								name="database"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>
												{t("backups.field.database")}
											</FormLabel>
											<FormControl>
												<Input
													disabled={databaseType === "web-server"}
													placeholder={t("backups.field.databasePlaceholder")}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>

							<ScheduleFormField name="schedule" formControl={form.control} />

							<FormField
								control={form.control}
								name="prefix"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>
												{t("backups.field.prefixStorage")}
											</FormLabel>
											<FormControl>
												<Input
													placeholder={t("backups.field.prefixStoragePlaceholder")}
													{...field}
												/>
											</FormControl>
											<FormDescription>
												{t("backups.handle.field.prefixDescription")}
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
											<FormLabel>
												{t("backups.field.keepLatest")}
											</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={t(
														"backups.handle.field.keepLatestPlaceholder",
													)}
													{...field}
												/>
											</FormControl>
											<FormDescription>
												{t("backups.handle.field.keepLatestDescription")}
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
											<FormLabel>
												{t("backups.handle.field.enabledLabel")}
											</FormLabel>
											<FormDescription>
												{t("backups.handle.field.enabledDescription")}
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
														{t("database.form.databaseUserLabel")}
													</FormLabel>
													<FormControl>
														<Input
															placeholder={t("database.form.databaseUserPlaceholder", {
																defaultUser: "postgres",
															})}
															{...field}
														/>
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
															{t("database.form.databaseUserLabel")}
														</FormLabel>
														<FormControl>
															<Input
																placeholder={t(
																	"database.form.databaseUserPlaceholder",
																	{ defaultUser: "mariadb" },
																)}
																{...field}
															/>
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
															{t("database.form.databasePasswordLabel")}
														</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder={t(
																	"database.form.databasePasswordLabel",
																)}
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
															{t("database.form.databaseUserLabel")}
														</FormLabel>
														<FormControl>
															<Input
																placeholder={t(
																	"database.form.databaseUserPlaceholder",
																	{ defaultUser: "mongo" },
																)}
																{...field}
															/>
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
															{t("database.form.databasePasswordLabel")}
														</FormLabel>
														<FormControl>
															<Input
																type="password"
																placeholder={t(
																	"database.form.databasePasswordLabel",
																)}
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
														{t("database.form.databaseRootPasswordLabel")}
													</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder={t(
																"database.form.databaseRootPasswordLabel",
															)}
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
								{backupId ? t("button.update") : t("button.create")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
