import { zodResolver } from "@hookform/resolvers/zod";
import copy from "copy-to-clipboard";
import _ from "lodash";
import { useTranslation } from "next-i18next";
import {
	CheckIcon,
	ChevronsUpDown,
	Copy,
	DatabaseZap,
	RefreshCw,
	RotateCcw,
} from "lucide-react";
import { useState } from "react";
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


const createRestoreBackupSchema = (
	t: (key: string, options?: Record<string, unknown>) => string,
) =>
	z
			.object({
				destinationId: z
					.string({
						required_error: t(
							"backups.restore.validation.destinationRequired",
						),
					})
					.min(1, {
						message: t("backups.restore.validation.destinationRequired"),
					}),
				backupFile: z
					.string({
						required_error: t(
							"backups.restore.validation.backupFileRequired",
						),
					})
					.min(1, {
						message: t("backups.restore.validation.backupFileRequired"),
					}),
				databaseName: z
					.string({
						required_error: t(
							"backups.restore.validation.databaseNameRequired",
						),
					})
					.min(1, {
						message: t("backups.restore.validation.databaseNameRequired"),
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
						message: t(
							"backups.restore.validation.databaseTypeRequiredForCompose",
						),
						path: ["databaseType"],
					});
				}

				if (data.backupType === "compose" && !data.metadata?.serviceName) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: t(
							"backups.restore.validation.serviceNameRequiredForCompose",
						),
						path: ["metadata", "serviceName"],
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

export const formatBytes = (bytes: number): string => {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

export const RestoreBackup = ({
	id,
	databaseType,
	serverId,
	backupType = "database",
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
	const { t } = useTranslation("common");

	const { data: destinations = [] } = api.destination.all.useQuery();

	const form = useForm<z.infer<ReturnType<typeof createRestoreBackupSchema>>>	({
		defaultValues: {
			destinationId: "",
			backupFile: "",
			databaseName: databaseType === "web-server" ? "dokploy" : "",
			databaseType:
				backupType === "compose" ? ("postgres" as DatabaseType) : databaseType,
			backupType: backupType,
			metadata: {},
		},
		resolver: zodResolver(createRestoreBackupSchema(t)),
	});

	const destionationId = form.watch("destinationId");
	const currentDatabaseType = form.watch("databaseType");
	const metadata = form.watch("metadata");

	const debouncedSetSearch = _.debounce((value: string) => {
		setDebouncedSearchTerm(value);
	}, 350);

	const handleSearchChange = (value: string) => {
		setSearch(value);
		debouncedSetSearch(value);
	};

	const { data: files = [], isLoading } = api.backup.listBackupFiles.useQuery(
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
			onError(error) {
				console.error("Restore logs error:", error);
				setIsDeploying(false);
			},
		},
	);

	const onSubmit = async (
		data: z.infer<ReturnType<typeof createRestoreBackupSchema>>,
	) => {
		if (backupType === "compose" && !data.databaseType) {
			toast.error(t("backups.restore.error.databaseTypeRequired"));
			return;
		}
		console.log({ data });
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
					{t("backups.restore.button.open")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center">
						<RotateCcw className="mr-2 size-4" />
						{t("backups.restore.dialog.title")}
					</DialogTitle>
					<DialogDescription>
						{t("backups.restore.dialog.description")}
					</DialogDescription>
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
													{field.value
														? destinations.find(
																(d) => d.destinationId === field.value,
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
												<CommandEmpty>
													{t("backups.restore.field.destinationEmpty")}
												</CommandEmpty>
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
										{t("backups.restore.field.backupFileLabel")}
										{field.value && (
											<Badge variant="outline" className="truncate">
												{field.value}
												<Copy
													className="ml-2 size-4 cursor-pointer"
													onClick={(e) => {
														e.stopPropagation();
														e.preventDefault();
														copy(field.value);
														toast.success(
															t("backups.restore.toast.fileCopied"),
														);
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
														{field.value ||
															t(
																"backups.restore.field.backupFileButtonPlaceholder",
															)}
													</span>
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder={t(
														"backups.restore.field.backupFileSearchPlaceholder",
													)}
													value={search}
													onValueChange={handleSearchChange}
													className="h-9"
												/>
												{isLoading ? (
													<div className="py-6 text-center text-sm">
														{t("backups.restore.field.backupFileLoading")}
													</div>
												) : files.length === 0 && search ? (
													<div className="py-6 text-center text-sm text-muted-foreground">
														{t(
															"backups.restore.field.backupFileEmptySearch",
															{ search },
														)}
													</div>
												) : files.length === 0 ? (
													<div className="py-6 text-center text-sm text-muted-foreground">
														{t("backups.restore.field.backupFileEmpty")}
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
																				{t("backups.restore.field.backupFileSize", {
																					size: formatBytes(file.Size),
																				})}
																			</span>
																			{file.IsDir && (
																				<span className="text-blue-500">
																					{t(
																						"backups.restore.field.backupFileDirectoryTag",
																					)}
																				</span>
																			)}
																			{file.Hashes?.MD5 && (
																				<span>
																					{t(
																						"backups.restore.field.backupFileMd5Label",
																						{ hash: file.Hashes.MD5 },
																					)}
																				</span>
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
									<FormLabel>
										{t("backups.restore.field.databaseNameLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"backups.restore.field.databaseNamePlaceholder",
											)}
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
											<FormLabel>
												{t("backups.restore.field.databaseTypeLabel")}
											</FormLabel>
											<Select
												value={field.value}
												onValueChange={(value: DatabaseType) => {
													field.onChange(value);
													form.setValue("metadata", {});
												}}
											>
												<SelectTrigger>
													<SelectValue
														placeholder={t(
															"backups.restore.field.databaseTypePlaceholder",
														)}
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
																{t(
																	"backups.restore.field.serviceNameEmpty",
																)}
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

								{currentDatabaseType === "postgres" && (
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
															placeholder={t(
																"database.form.databaseUserPlaceholder",
																{ defaultUser: "postgres" },
															)}
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

								{currentDatabaseType === "mongo" && (
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

								{currentDatabaseType === "mysql" && (
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
								{t("button.restore")}
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
