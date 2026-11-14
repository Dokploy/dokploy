import { backupCommandExamples } from "@dokploy/server/db/schema/backup-command";
import {
	backupMetadataSchema,
	customNameSchema,
	validateBackupConfiguration,
} from "@dokploy/server/db/schema/backup-metadata";
import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import {
	CheckIcon,
	ChevronsUpDown,
	DatabaseZap,
	PenBoxIcon,
	PlusIcon,
	RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type FieldPath, useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { ScheduleFormField } from "../../application/schedules/handle-schedules";

type DatabaseType =
	| "postgres"
	| "mariadb"
	| "mysql"
	| "mongo"
	| "web-server"
	| "libsql";
const Schema = z
	.object({
		destinationId: z.string().min(1, "Destination required"),
		schedule: z.string().min(1, "Schedule (Cron) required"),
		prefix: z.string().min(1, "Prefix required"),
		customName: customNameSchema,
		enabled: z.boolean(),
		includeEncryptionKey: z.boolean(),
		database: z.string().min(1, "Database required"),
		keepLatestCount: z.number().int().min(1).optional(),
		serviceName: z.string().nullable(),
		databaseType: z.enum([
			"postgres",
			"mariadb",
			"mysql",
			"mongo",
			"web-server",
			"libsql",
		]),
		backupType: z.enum(["database", "compose"]),
		metadata: backupMetadataSchema,
	})
	.superRefine(validateBackupConfiguration);
type FormValues = z.infer<typeof Schema>;

const resolveBackup = zodResolver(Schema);

const labels = {
	postgres: "PostgreSQL",
	mysql: "MySQL",
	mariadb: "MariaDB",
	mongo: "MongoDB",
};

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
	const [destinationOpen, setDestinationOpen] = useState(false);
	const [cacheType, setCacheType] = useState<"cache" | "fetch">("cache");
	const connectionRef = useRef<HTMLDetailsElement>(null);
	const argumentsRef = useRef<HTMLDetailsElement>(null);
	const { data: destinations, isPending: loadingDestinations } =
		api.destination.all.useQuery();
	const { data: backup, isPending: loadingBackup } = api.backup.one.useQuery(
		{ backupId: backupId ?? "" },
		{ enabled: !!backupId && isOpen },
	);
	const create = api.backup.create.useMutation();
	const update = api.backup.update.useMutation();
	const isSaving = create.isPending || update.isPending;
	const form = useForm<FormValues>({
		resolver: (values, context, options) => {
			// Preserve drafts when switching engines or methods, but only validate
			// and submit the settings used by the selected backup command.
			const metadata = { ...values.metadata };
			for (const type of Object.keys(labels) as (keyof typeof labels)[]) {
				if (type !== values.databaseType) delete metadata[type];
				else if (metadata.backupMode === "custom" && metadata[type])
					metadata[type] = { ...metadata[type], additionalArgs: undefined };
			}
			if (metadata.backupMode !== "custom") delete metadata.custom;
			return resolveBackup({ ...values, metadata }, context, options);
		},
		defaultValues: {
			database: "",
			destinationId: "",
			enabled: true,
			includeEncryptionKey: true,
			prefix: "/",
			customName: "",
			schedule: "",
			serviceName: null,
			databaseType,
			backupType,
			metadata: {},
		},
	});
	const {
		data: services,
		isFetching: loadingServices,
		error: errorServices,
		refetch: refetchServices,
	} = api.compose.loadServices.useQuery(
		{ composeId: backup?.composeId ?? id ?? "", type: cacheType },
		{
			retry: false,
			refetchOnWindowFocus: false,
			enabled:
				isOpen && backupType === "compose" && !!(backup?.composeId ?? id),
		},
	);
	useEffect(() => {
		if (!isOpen || (backupId && !backup)) return;
		form.reset({
			database:
				backup?.database ??
				(databaseType === "web-server"
					? "dokploy"
					: databaseType === "libsql"
						? "iku.db"
						: ""),
			destinationId: backup?.destinationId ?? "",
			enabled: backup?.enabled ?? true,
			includeEncryptionKey: backup?.includeEncryptionKey ?? true,
			prefix: backup?.prefix ?? "/",
			customName: backup?.customName ?? "",
			schedule: backup?.schedule ?? "",
			keepLatestCount: backup?.keepLatestCount || undefined,
			serviceName: backup?.serviceName ?? null,
			databaseType: backup?.databaseType ?? databaseType,
			backupType: backup?.backupType ?? backupType,
			metadata: backup?.metadata ?? {},
		});
	}, [isOpen, backup, backupId, databaseType, backupType, form]);
	const selectedType = form.watch("databaseType");
	const mode = form.watch("metadata.backupMode") ?? "default";
	const custom = mode === "custom";
	const engine =
		selectedType === "postgres" ||
		selectedType === "mysql" ||
		selectedType === "mariadb" ||
		selectedType === "mongo"
			? selectedType
			: undefined;
	const connectionUri =
		engine === "postgres" || engine === "mongo"
			? form.watch(`metadata.${engine}.connectionUri`)
			: undefined;

	const textField = (
		name: FieldPath<FormValues>,
		label: string,
		placeholder = "",
		options: {
			password?: boolean;
			number?: boolean;
			description?: string;
			disabled?: boolean;
		} = {},
	) => (
		<FormField
			key={name}
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem className="min-w-0">
					<FormLabel>{label}</FormLabel>
					<FormControl>
						<Input
							{...field}
							value={
								typeof field.value === "string" ||
								typeof field.value === "number"
									? field.value
									: ""
							}
							type={
								options.password
									? "password"
									: options.number
										? "number"
										: "text"
							}
							placeholder={placeholder}
							disabled={options.disabled}
							autoComplete={options.password ? "new-password" : "off"}
							min={options.number ? 1 : undefined}
							max={name.endsWith("databasePort") ? 65535 : undefined}
							onChange={(event) =>
								field.onChange(
									options.number
										? event.target.value === ""
											? undefined
											: Number(event.target.value)
										: event.target.value,
								)
							}
						/>
					</FormControl>
					{options.description && (
						<FormDescription>{options.description}</FormDescription>
					)}
					<FormMessage />
				</FormItem>
			)}
		/>
	);
	const onSubmit = async (values: FormValues) => {
		const ids =
			backupType === "compose"
				? { composeId: id }
				: databaseType === "web-server"
					? { userId: id }
					: { [`${databaseType}Id`]: id };
		const payload = {
			...values,
			...ids,
			keepLatestCount: values.keepLatestCount ?? 0,
			backupId: backupId ?? "",
		};
		try {
			if (backupId) await update.mutateAsync(payload);
			else await create.mutateAsync(payload);
			toast.success(`Backup ${backupId ? "Updated" : "Created"}`);
			refetch();
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save backup",
			);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{backupId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 size-8"
						aria-label="Edit backup"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>
						<PlusIcon className="size-4" />
						Create Backup
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-clip">
				<DialogHeader className="px-6 py-5 border-b shrink-0">
					<DialogTitle>
						{backupId ? "Update Backup" : "Create Backup"}
					</DialogTitle>
					<DialogDescription>
						{backupId ? "Update a backup" : "Add a new backup"}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="hook-form-add-backup"
						noValidate
						onSubmit={form.handleSubmit(onSubmit, (errors) => {
							const connectionErrors = engine && errors.metadata?.[engine];
							if (!connectionErrors) return;
							if (
								connectionRef.current &&
								Object.keys(connectionErrors).some(
									(key) => key !== "additionalArgs",
								)
							)
								connectionRef.current.open = true;
							if (argumentsRef.current && connectionErrors.additionalArgs)
								argumentsRef.current.open = true;
						})}
						className="flex min-h-0 flex-col overflow-hidden"
					>
						<div className="min-h-0 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
							{errorServices && (
								<AlertBlock type="warning" className="wrap-anywhere">
									{errorServices.message}
								</AlertBlock>
							)}
							<section
								className="space-y-4"
								aria-labelledby="backup-source-title"
							>
								<h3 id="backup-source-title" className="font-medium">
									Backup source
								</h3>
								<div className="grid gap-4 sm:grid-cols-2">
									{backupType === "compose" && (
										<>
											<FormField
												control={form.control}
												name="databaseType"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Database Type</FormLabel>
														<Select
															value={field.value}
															onValueChange={field.onChange}
														>
															<FormControl>
																<SelectTrigger className="w-full">
																	<SelectValue placeholder="Select a database type" />
																</SelectTrigger>
															</FormControl>
															<SelectContent>
																{Object.entries(labels).map(
																	([value, label]) => (
																		<SelectItem key={value} value={value}>
																			{label}
																		</SelectItem>
																	),
																)}
															</SelectContent>
														</Select>
														<FormMessage />
													</FormItem>
												)}
											/>
											<FormField
												control={form.control}
												name="serviceName"
												render={({ field }) => (
													<FormItem className="min-w-0">
														<FormLabel>Service Name</FormLabel>
														<div className="flex gap-2">
															<Select
																value={field.value ?? ""}
																onValueChange={field.onChange}
															>
																<FormControl>
																	<SelectTrigger className="w-full min-w-0">
																		<SelectValue placeholder="Select a service name" />
																	</SelectTrigger>
																</FormControl>
																<SelectContent>
																	{services?.map((service) => (
																		<SelectItem key={service} value={service}>
																			{service}
																		</SelectItem>
																	))}
																	{!services?.length && (
																		<SelectItem value="none" disabled>
																			Empty
																		</SelectItem>
																	)}
																</SelectContent>
															</Select>
															<Button
																variant="secondary"
																size="icon"
																type="button"
																aria-label="Fetch services"
																title="Fetch: Will clone the repository and load the services"
																isLoading={loadingServices}
																onClick={() =>
																	cacheType === "fetch"
																		? refetchServices()
																		: setCacheType("fetch")
																}
															>
																<RefreshCw className="size-4" />
															</Button>
															<Button
																variant="secondary"
																size="icon"
																type="button"
																aria-label="Load cached services"
																title="Cache: If you previously deployed this compose, it will read the services from the last deployment/fetch from the repository"
																onClick={() =>
																	cacheType === "cache"
																		? refetchServices()
																		: setCacheType("cache")
																}
															>
																<DatabaseZap className="size-4" />
															</Button>
														</div>
														<FormMessage />
													</FormItem>
												)}
											/>
										</>
									)}
									{textField("database", "Database", "dokploy", {
										disabled:
											databaseType === "web-server" ||
											databaseType === "libsql",
									})}
									{backupType === "compose" && (
										<FormField
											control={form.control}
											name="metadata.backupMode"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Backup method</FormLabel>
													<Select
														value={custom ? "custom" : "default"}
														onValueChange={field.onChange}
													>
														<FormControl>
															<SelectTrigger className="w-full">
																<SelectValue />
															</SelectTrigger>
														</FormControl>
														<SelectContent>
															<SelectItem value="default">
																Default script
															</SelectItem>
															<SelectItem value="custom">
																Custom script
															</SelectItem>
														</SelectContent>
													</Select>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}
								</div>
								{backupType === "compose" && (
									<p className="text-sm text-muted-foreground">
										The backup runs inside the selected service. Use a host and
										port reachable from that container.
									</p>
								)}
							</section>
							{backupType === "compose" && engine && (
								<details
									ref={connectionRef}
									className="space-y-4 border-t pt-5"
									aria-labelledby="backup-connection-title"
								>
									<summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
										<h3 id="backup-connection-title" className="inline">
											Connection settings
										</h3>
										<span className="mt-1 block text-sm font-normal text-muted-foreground">
											Optional overrides. Leave empty to keep the existing
											defaults.
										</span>
									</summary>
									{connectionUri && (
										<p className="text-sm text-muted-foreground">
											The connection URI takes precedence over the host, port,
											user and password fields
											{engine === "postgres"
												? ", including the database name"
												: ""}
											.
										</p>
									)}
									<div className="grid gap-4 sm:grid-cols-2">
										{textField(
											`metadata.${engine}.databaseHost`,
											"Host",
											engine === "mysql" || engine === "mariadb"
												? custom
													? "127.0.0.1"
													: "Default local socket"
												: "localhost",
											{ disabled: !!connectionUri },
										)}
										{textField(
											`metadata.${engine}.databasePort`,
											"Port",
											engine === "postgres"
												? "5432"
												: engine === "mongo"
													? "27017"
													: "3306",
											{ number: true, disabled: !!connectionUri },
										)}
										{textField(
											`metadata.${engine}.databaseUser`,
											"Database User",
											engine === "postgres"
												? "postgres"
												: engine === "mysql" || engine === "mariadb"
													? engine === "mariadb"
														? "mariadb"
														: "root"
													: "mongo",
											{ disabled: !!connectionUri },
										)}
										{textField(
											engine === "mysql" &&
												form.watch("metadata.mysql.databasePassword") ===
													undefined &&
												backup?.metadata?.mysql?.databaseRootPassword !==
													undefined
												? "metadata.mysql.databaseRootPassword"
												: `metadata.${engine}.databasePassword`,
											engine === "mysql" &&
												(!form.watch("metadata.mysql.databaseUser") ||
													form.watch("metadata.mysql.databaseUser") === "root")
												? "Root Password"
												: "Database Password",
											engine === "postgres" ? "Optional password" : "••••••••",
											{ password: true, disabled: !!connectionUri },
										)}
										{engine === "mongo" &&
											textField(
												"metadata.mongo.authenticationDatabase",
												"Authentication database",
												"admin",
												{ disabled: !!connectionUri },
											)}
									</div>
									{(engine === "postgres" || engine === "mongo") &&
										textField(
											`metadata.${engine}.connectionUri`,
											"Connection URI",
											engine === "postgres"
												? "postgresql://user:password@host:port/database"
												: "mongodb://user:password@host:port/?authSource=admin",
											{
												password: true,
												description:
													"Optional. Include connection options such as TLS or replica-set settings in the URI.",
											},
										)}
								</details>
							)}
							{backupType === "compose" && engine && !custom && (
								<details
									ref={argumentsRef}
									className="rounded-lg border px-4 py-3"
								>
									<summary className="cursor-pointer text-sm font-medium">
										Additional dump arguments
									</summary>
									<FormField
										key={engine}
										control={form.control}
										name={`metadata.${engine}.additionalArgs`}
										render={({ field }) => (
											<FormItem className="mt-3">
												<FormLabel>Arguments</FormLabel>
												<FormControl>
													<Textarea
														{...field}
														className="font-mono text-sm"
														rows={3}
														placeholder={
															engine === "postgres"
																? "--exclude-table-data=events"
																: engine === "mongo"
																	? "--readPreference=secondaryPreferred"
																	: "--routines\n--events"
														}
														value={field.value?.join("\n") ?? ""}
														onChange={(event) =>
															field.onChange(
																event.target.value
																	? event.target.value.split("\n")
																	: [],
															)
														}
													/>
												</FormControl>
												<FormDescription>
													One --option or --option=value per line. Values are
													passed literally, without shell expansion. Only
													supported dump options are accepted. Dokploy manages
													the output format and destination.
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>
								</details>
							)}
							{backupType === "compose" && custom && engine && (
								<section
									className="space-y-4 border-t pt-5"
									aria-labelledby="backup-script-title"
								>
									<div>
										<h3 id="backup-script-title" className="font-medium">
											Custom backup command
										</h3>
										<p className="mt-1 text-sm text-muted-foreground">
											Customize a supported dump command. Dokploy supplies the
											selected database connection, compresses the output and
											uploads it to S3.
										</p>
									</div>
									<FormField
										control={form.control}
										name="metadata.custom.script"
										render={({ field }) => (
											<FormItem>
												<div className="flex flex-wrap items-center justify-between gap-2">
													<FormLabel>Command</FormLabel>
													<Button
														variant="outline"
														size="sm"
														type="button"
														onClick={() => {
															form.setValue(
																"metadata.custom.script",
																backupCommandExamples[engine],
																{ shouldValidate: true },
															);
														}}
													>
														Use default as starting point
													</Button>
												</div>
												<FormControl>
													<Textarea
														{...field}
														value={field.value ?? ""}
														rows={3}
														spellCheck={false}
														className="font-mono text-sm resize-y"
														placeholder={backupCommandExamples[engine]}
													/>
												</FormControl>
												<FormDescription>
													One command with supported dump options. Shell
													scripts, pipes, redirects, variables, connection flags
													and file writes are rejected. Enter credentials in
													Connection settings.
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>
									<AlertBlock title="Test required before saving">
										Dokploy runs the command with these database credentials
										before every save. The test must succeed and produce backup
										data. It runs for up to 5 minutes, without uploading to S3.
										Failure leaves the configuration unchanged.
									</AlertBlock>
									<p className="text-sm text-muted-foreground">
										The command runs in the existing service using Dokploy’s
										backup pipeline. No extra service is started. The service
										must have the database dump utility and timeout installed.
									</p>
								</section>
							)}
							<section
								className="space-y-4 border-t pt-5"
								aria-labelledby="backup-storage-title"
							>
								<h3 id="backup-storage-title" className="font-medium">
									Storage and schedule
								</h3>
								<div className="grid gap-4 sm:grid-cols-2">
									<FormField
										control={form.control}
										name="destinationId"
										render={({ field }) => (
											<FormItem className="min-w-0">
												<FormLabel>Destination</FormLabel>
												<Popover
													open={destinationOpen}
													onOpenChange={setDestinationOpen}
												>
													<PopoverTrigger asChild>
														<FormControl>
															<Button
																variant="outline"
																className={cn(
																	"w-full justify-between",
																	!field.value && "text-muted-foreground",
																)}
															>
																<span className="truncate">
																	{loadingDestinations
																		? "Loading...."
																		: (destinations?.find(
																				(destination) =>
																					destination.destinationId ===
																					field.value,
																			)?.name ?? "Select Destination")}
																</span>
																<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
															</Button>
														</FormControl>
													</PopoverTrigger>
													<PopoverContent className="p-0" align="start">
														<Command>
															<CommandInput placeholder="Search Destination..." />
															{loadingDestinations && (
																<span className="py-6 text-center text-sm">
																	Loading Destinations....
																</span>
															)}
															<CommandEmpty>
																No destinations found.
															</CommandEmpty>
															<ScrollArea className="max-h-64">
																<CommandGroup>
																	{destinations?.map((destination) => (
																		<CommandItem
																			value={destination.name}
																			key={destination.destinationId}
																			onSelect={() => {
																				field.onChange(
																					destination.destinationId,
																				);
																				setDestinationOpen(false);
																			}}
																		>
																			{destination.name}
																			<CheckIcon
																				className={cn(
																					"ml-auto size-4",
																					destination.destinationId ===
																						field.value
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
									{textField("prefix", "Prefix Destination", "dokploy/", {
										description:
											"Use if you want to back up in a specific path of your destination/bucket",
									})}
									<div className="sm:col-span-2">
										{textField("customName", "Custom File Name", "my-backup", {
											description:
												'Optional. Prepended to the automatically generated timestamp, e.g. "my-backup-2026-08-03T20-58-22-123Z.sql.gz". Only letters, numbers, dots, hyphens and underscores are allowed. "Keep the latest" counts every backup in the same destination folder, regardless of its custom name.',
										})}
									</div>
									<ScheduleFormField
										name="schedule"
										formControl={form.control}
									/>
									{textField(
										"keepLatestCount",
										"Keep the latest",
										"keeps all the backups if left empty",
										{
											number: true,
											description:
												"Optional. If provided, only keeps the latest N backups in the cloud.",
										},
									)}
								</div>
								<FormField
									control={form.control}
									name="enabled"
									render={({ field }) => (
										<FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
											<div className="space-y-1">
												<FormLabel>Enabled</FormLabel>
												<FormDescription>
													Enable or disable the backup
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
								{databaseType === "web-server" && (
									<FormField
										control={form.control}
										name="includeEncryptionKey"
										render={({ field }) => (
											<FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
												<div>
													<FormLabel>Include encryption key</FormLabel>
													<FormDescription>
														Stores the encryption key inside the backup so
														environment variables can be restored on a new
														server. Anyone with access to the backup file can
														decrypt them.
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
								)}
							</section>
						</div>
						<DialogFooter className="border-t px-6 py-4 shrink-0">
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsOpen(false)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								isLoading={isSaving}
								disabled={!!backupId && loadingBackup}
							>
								{custom && backupType === "compose"
									? backupId
										? "Test and update"
										: "Test and create"
									: backupId
										? "Update"
										: "Create"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
