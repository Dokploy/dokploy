import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import debounce from "lodash/debounce";
import {
	CheckIcon,
	ChevronsUpDown,
	Copy,
	DatabaseZap,
	RefreshCw,
	RotateCcw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Badge } from "@/components/ui/badge";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import type { ServiceType } from "../../application/advanced/show-resources";
import { type LogLine, parseLogs } from "../../docker/logs/utils";

type DatabaseType =
	| Exclude<ServiceType, "application" | "redis">
	| "web-server";

interface Props {
	id: string;
	databaseType?: DatabaseType;
	serverId?: string | null;
	backupType?: "database" | "compose";
}

const DEFAULT_BYTE_UNITS = ["Bytes", "KB", "MB", "GB", "TB"] as const;

const createRestoreBackupSchema = (tVal: (key: string) => string) =>
	z
		.object({
			destinationId: z.string().min(1, {
				message: tVal("destinationRequired"),
			}),
			backupFile: z.string().min(1, {
				message: tVal("backupFileRequired"),
			}),
			databaseName: z.string().min(1, {
				message: tVal("databaseNameRequired"),
			}),
			databaseType: z
				.enum(["postgres", "mariadb", "mysql", "mongo", "web-server"])
				.optional(),
			backupType: z.enum(["database", "compose"]).default("database"),
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
					serviceName: z.string().optional(),
				})
				.optional(),
		})
		.superRefine((data, ctx) => {
			if (data.backupType === "compose" && !data.databaseType) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: tVal("databaseTypeRequiredCompose"),
					path: ["databaseType"],
				});
			}

			if (data.backupType === "compose" && !data.metadata?.serviceName) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: tVal("serviceNameRequiredCompose"),
					path: ["metadata", "serviceName"],
				});
			}

			if (data.backupType === "compose" && data.databaseType) {
				if (data.databaseType === "postgres") {
					if (!data.metadata?.postgres?.databaseUser) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: tVal("postgresUserRequired"),
							path: ["metadata", "postgres", "databaseUser"],
						});
					}
				} else if (data.databaseType === "mariadb") {
					if (!data.metadata?.mariadb?.databaseUser) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: tVal("mariadbUserRequired"),
							path: ["metadata", "mariadb", "databaseUser"],
						});
					}
					if (!data.metadata?.mariadb?.databasePassword) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: tVal("mariadbPasswordRequired"),
							path: ["metadata", "mariadb", "databasePassword"],
						});
					}
				} else if (data.databaseType === "mongo") {
					if (!data.metadata?.mongo?.databaseUser) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: tVal("mongoUserRequired"),
							path: ["metadata", "mongo", "databaseUser"],
						});
					}
					if (!data.metadata?.mongo?.databasePassword) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: tVal("mongoPasswordRequired"),
							path: ["metadata", "mongo", "databasePassword"],
						});
					}
				} else if (data.databaseType === "mysql") {
					if (!data.metadata?.mysql?.databaseRootPassword) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: tVal("mysqlRootPasswordRequired"),
							path: ["metadata", "mysql", "databaseRootPassword"],
						});
					}
				}
			}
		});

export const formatBytes = (
	bytes: number,
	units: readonly string[] = DEFAULT_BYTE_UNITS,
): string => {
	if (bytes === 0) return `0 ${units[0]}`;
	const k = 1024;
	const i = Math.min(
		Math.floor(Math.log(bytes) / Math.log(k)),
		units.length - 1,
	);
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${units[i]}`;
};

export const RestoreBackup = ({
	id,
	databaseType,
	serverId,
	backupType = "database",
}: Props) => {
	const t = useTranslations("databaseBackups.restore");
	const tVal = useTranslations("databaseBackups.validation");
	const restoreSchema = useMemo(() => createRestoreBackupSchema(tVal), [tVal]);
	const formatSize = useCallback(
		(bytes: number) =>
			formatBytes(bytes, [
				t("unitBytes"),
				t("unitKb"),
				t("unitMb"),
				t("unitGb"),
				t("unitTb"),
			]),
		[t],
	);
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

	const { data: destinations = [] } = api.destination.all.useQuery();

	const form = useForm({
		defaultValues: {
			destinationId: "",
			backupFile: "",
			databaseName: databaseType === "web-server" ? "dokploy" : "",
			databaseType:
				backupType === "compose" ? ("postgres" as DatabaseType) : databaseType,
			backupType: backupType,
			metadata: {},
		},
		resolver: zodResolver(restoreSchema),
	});

	const destionationId = form.watch("destinationId");
	const currentDatabaseType = form.watch("databaseType");
	const metadata = form.watch("metadata");

	const debouncedSetSearch = debounce((value: string) => {
		setDebouncedSearchTerm(value);
	}, 350);

	const handleSearchChange = (value: string) => {
		setSearch(value);
		debouncedSetSearch(value);
	};

	const { data: files = [], isPending } = api.backup.listBackupFiles.useQuery(
		{
			destinationId: destionationId,
			search: debouncedSearchTerm,
			serverId: serverId ?? "",
		},
		{
			enabled: isOpen && !!destionationId,
		},
	);

	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);

	api.backup.restoreBackupWithLogs.useSubscription(
		{
			databaseId: id,
			databaseType: currentDatabaseType as DatabaseType,
			databaseName: form.watch("databaseName"),
			backupFile: form.watch("backupFile"),
			destinationId: form.watch("destinationId"),
			backupType: backupType,
			metadata: metadata,
		},
		{
			enabled: isDeploying,
			onData(log) {
				if (!isDrawerOpen) {
					setIsDrawerOpen(true);
				}

				if (log === "Restore completed successfully!") {
					setIsDeploying(false);
				}
				const parsedLogs = parseLogs(log);
				setFilteredLogs((prev) => [...prev, ...parsedLogs]);
			},
			onError() {
				setIsDeploying(false);
			},
		},
	);

	const onSubmit = async (
		data: z.infer<ReturnType<typeof createRestoreBackupSchema>>,
	) => {
		if (backupType === "compose" && !data.databaseType) {
			toast.error(t("toastSelectDatabaseType"));
			return;
		}
		setIsDeploying(true);
	};

	const [cacheType, setCacheType] = useState<"fetch" | "cache">("cache");
	const {
		data: services = [],
		isLoading: isLoadingServices,
		refetch: refetchServices,
	} = api.compose.loadServices.useQuery(
		{
			composeId: id,
			type: cacheType,
		},
		{
			retry: false,
			refetchOnWindowFocus: false,
			enabled: backupType === "compose",
		},
	);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<RotateCcw className="mr-2 size-4" />
					{t("trigger")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center">
						<RotateCcw className="mr-2 size-4" />
						{t("title")}
					</DialogTitle>
					<DialogDescription>{t("description")}</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form-restore-backup"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="destinationId"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel>{t("destination")}</FormLabel>
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
													{field.value
														? destinations.find(
																(d) => d.destinationId === field.value,
															)?.name
														: t("selectDestination")}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t("searchDestinationsPlaceholder")}
													className="h-9"
												/>
												<CommandEmpty>{t("noDestinationsFound")}</CommandEmpty>
												<ScrollArea className="h-64">
													<CommandGroup>
														{destinations.map((destination) => (
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

						<FormField
							control={form.control}
							name="backupFile"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel className="flex items-center justify-between">
										{t("searchBackupFiles")}
										{field.value && (
											<Badge variant="outline" className="truncate">
												{field.value}
												<Copy
													className="ml-2 size-4 cursor-pointer"
													onClick={(e) => {
														e.stopPropagation();
														e.preventDefault();
														copy(field.value);
														toast.success(t("backupFileCopied"));
													}}
												/>
											</Badge>
										)}
									</FormLabel>
									<Popover modal>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													className={cn(
														"w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													<span className="truncate text-left flex-1 w-52">
														{field.value || t("searchSelectBackupPlaceholder")}
													</span>
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t("searchBackupFilesPlaceholder")}
													value={search}
													onValueChange={handleSearchChange}
													className="h-9"
												/>
												{isPending ? (
													<div className="py-6 text-center text-sm">
														{t("loadingBackupFiles")}
													</div>
												) : files.length === 0 && search ? (
													<div className="py-6 text-center text-sm text-muted-foreground">
														{t("noBackupFilesForQuery", { query: search })}
													</div>
												) : files.length === 0 ? (
													<div className="py-6 text-center text-sm text-muted-foreground">
														{t("noBackupFilesAvailable")}
													</div>
												) : (
													<ScrollArea className="h-64">
														<CommandGroup className="w-96">
															{files?.map((file) => (
																<CommandItem
																	value={file.Path}
																	key={file.Path}
																	onSelect={() => {
																		form.setValue("backupFile", file.Path);
																		if (file.IsDir) {
																			setSearch(`${file.Path}/`);
																			setDebouncedSearchTerm(`${file.Path}/`);
																		} else {
																			setSearch(file.Path);
																			setDebouncedSearchTerm(file.Path);
																		}
																	}}
																>
																	<div className="flex w-full flex-col gap-1">
																		<div className="flex w-full justify-between">
																			<span className="font-medium">
																				{file.Path}
																			</span>

																			<CheckIcon
																				className={cn(
																					"ml-auto h-4 w-4",
																					file.Path === field.value
																						? "opacity-100"
																						: "opacity-0",
																				)}
																			/>
																		</div>
																		<div className="flex items-center gap-4 text-xs text-muted-foreground">
																			<span>
																				{t("sizeLabel")}:{" "}
																				{formatSize(file.Size)}
																			</span>
																			{file.IsDir && (
																				<span className="text-blue-500">
																					{t("directory")}
																				</span>
																			)}
																			{file.Hashes?.MD5 && (
																				<span>MD5: {file.Hashes.MD5}</span>
																			)}
																		</div>
																	</div>
																</CommandItem>
															))}
														</CommandGroup>
													</ScrollArea>
												)}
											</Command>
										</PopoverContent>
									</Popover>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="databaseName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("databaseName")}</FormLabel>
									<FormControl>
										<Input
											placeholder={t("databaseNamePlaceholder")}
											{...field}
											disabled={databaseType === "web-server"}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{backupType === "compose" && (
							<>
								<FormField
									control={form.control}
									name="databaseType"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("databaseType")}</FormLabel>
											<Select
												value={field.value}
												onValueChange={(value: DatabaseType) => {
													field.onChange(value);
													form.setValue("metadata", {});
												}}
											>
												<SelectTrigger>
													<SelectValue
														placeholder={t("selectDatabaseTypePlaceholder")}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="postgres">PostgreSQL</SelectItem>
													<SelectItem value="mariadb">MariaDB</SelectItem>
													<SelectItem value="mongo">MongoDB</SelectItem>
													<SelectItem value="mysql">MySQL</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="metadata.serviceName"
									render={({ field }) => (
										<FormItem className="w-full">
											<FormLabel>{t("serviceName")}</FormLabel>
											<div className="flex gap-2">
												<Select
													onValueChange={field.onChange}
													value={field.value || undefined}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue
																placeholder={t("selectServiceNamePlaceholder")}
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
																{t("emptyServices")}
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
															<p>{t("tooltipFetch")}</p>
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
															<p>{t("tooltipCache")}</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>

											<FormMessage />
										</FormItem>
									)}
								/>

								{currentDatabaseType === "postgres" && (
									<FormField
										control={form.control}
										name="metadata.postgres.databaseUser"
										render={({ field }) => (
											<FormItem>
												<FormLabel>{t("databaseUser")}</FormLabel>
												<FormControl>
													<Input
														placeholder={t("databaseUserPlaceholder")}
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}

								{currentDatabaseType === "mariadb" && (
									<>
										<FormField
											control={form.control}
											name="metadata.mariadb.databaseUser"
											render={({ field }) => (
												<FormItem>
													<FormLabel>{t("databaseUser")}</FormLabel>
													<FormControl>
														<Input
															placeholder={t("databaseUserPlaceholder")}
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
													<FormLabel>{t("databasePassword")}</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder={t("databasePasswordPlaceholder")}
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}

								{currentDatabaseType === "mongo" && (
									<>
										<FormField
											control={form.control}
											name="metadata.mongo.databaseUser"
											render={({ field }) => (
												<FormItem>
													<FormLabel>{t("databaseUser")}</FormLabel>
													<FormControl>
														<Input
															placeholder={t("databaseUserPlaceholder")}
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
													<FormLabel>{t("databasePassword")}</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder={t("databasePasswordPlaceholder")}
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</>
								)}

								{currentDatabaseType === "mysql" && (
									<FormField
										control={form.control}
										name="metadata.mysql.databaseRootPassword"
										render={({ field }) => (
											<FormItem>
												<FormLabel>{t("rootPassword")}</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder={t("rootPasswordPlaceholder")}
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

						<DialogFooter>
							<Button
								isLoading={isDeploying}
								form="hook-form-restore-backup"
								type="submit"
								// disabled={
								// 	!form.watch("backupFile") ||
								// 	(backupType === "compose" && !form.watch("databaseType"))
								// }
							>
								{t("restore")}
							</Button>
						</DialogFooter>
					</form>
				</Form>

				<DrawerLogs
					isOpen={isDrawerOpen}
					onClose={() => {
						setIsDrawerOpen(false);
						setFilteredLogs([]);
						setIsDeploying(false);
						// refetch();
					}}
					filteredLogs={filteredLogs}
				/>
			</DialogContent>
		</Dialog>
	);
};
