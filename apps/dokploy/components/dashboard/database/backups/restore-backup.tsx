import { zodResolver } from "@hookform/resolvers/zod";
import copy from "copy-to-clipboard";
import { debounce } from "lodash";
import {
	CheckIcon,
	ChevronsUpDown,
	Copy,
	DatabaseZap,
	RefreshCw,
	RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
        FormDescription,
        FormField,
        FormItem,
        FormLabel,
        FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

const MANUAL_GPG_KEY_OPTION = "__manual_gpg_key__";

const RestoreBackupSchema = z
	.object({
		destinationId: z
			.string({
				required_error: "Please select a destination",
			})
			.min(1, {
				message: "Destination is required",
			}),
		backupFile: z
			.string({
				required_error: "Please select a backup file",
			})
			.min(1, {
				message: "Backup file is required",
			}),
		databaseName: z
			.string({
				required_error: "Please enter a database name",
			})
			.min(1, {
				message: "Database name is required",
			}),
                databaseType: z
                        .enum(["postgres", "mariadb", "mysql", "mongo", "web-server"])
                        .optional(),
                backupType: z.enum(["database", "compose"]).default("database"),
                gpgPrivateKey: z
                        .string()
                        .optional()
                        .transform((value) => {
                                if (!value) return undefined;
                                const trimmed = value.trim();
                                return trimmed.length > 0 ? trimmed : undefined;
                        }),
                gpgPassphrase: z
                        .string()
                        .optional()
                        .transform((value) => {
                                if (!value) return undefined;
                                const trimmed = value.trim();
                                return trimmed.length > 0 ? trimmed : undefined;
                        }),
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
				message: "Database type is required for compose backups",
				path: ["databaseType"],
			});
		}

		if (data.backupType === "compose" && !data.metadata?.serviceName) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Service name is required for compose backups",
				path: ["metadata", "serviceName"],
			});
		}

                if (data.backupType === "compose" && data.databaseType) {
                        if (data.databaseType === "postgres") {
                                if (!data.metadata?.postgres?.databaseUser) {
                                        ctx.addIssue({
                                                code: z.ZodIssueCode.custom,
						message: "Database user is required for PostgreSQL",
						path: ["metadata", "postgres", "databaseUser"],
					});
				}
			} else if (data.databaseType === "mariadb") {
				if (!data.metadata?.mariadb?.databaseUser) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Database user is required for MariaDB",
						path: ["metadata", "mariadb", "databaseUser"],
					});
				}
				if (!data.metadata?.mariadb?.databasePassword) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Database password is required for MariaDB",
						path: ["metadata", "mariadb", "databasePassword"],
					});
				}
			} else if (data.databaseType === "mongo") {
				if (!data.metadata?.mongo?.databaseUser) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Database user is required for MongoDB",
						path: ["metadata", "mongo", "databaseUser"],
					});
				}
				if (!data.metadata?.mongo?.databasePassword) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Database password is required for MongoDB",
						path: ["metadata", "mongo", "databasePassword"],
					});
				}
			} else if (data.databaseType === "mysql") {
				if (!data.metadata?.mysql?.databaseRootPassword) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Root password is required for MySQL",
						path: ["metadata", "mysql", "databaseRootPassword"],
					});
                                }
                        }
                }

                if (data.backupFile.endsWith(".gpg") && !data.gpgPrivateKey) {
                        ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: "A GPG private key is required to restore encrypted backups",
                                path: ["gpgPrivateKey"],
                        });
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

        const { data: destinations = [] } = api.destination.all.useQuery();
        const { data: gpgKeys = [], isLoading: isLoadingGpgKeys } = api.gpgKey.all.useQuery(undefined, {
                enabled: isOpen,
        });

	const form = useForm<z.infer<typeof RestoreBackupSchema>>({
                defaultValues: {
                        destinationId: "",
                        backupFile: "",
                        databaseName: databaseType === "web-server" ? "dokploy" : "",
                        databaseType:
                                backupType === "compose" ? ("postgres" as DatabaseType) : databaseType,
                        backupType: backupType,
                        metadata: {},
                        gpgPrivateKey: "",
                        gpgPassphrase: "",
                },
		resolver: zodResolver(RestoreBackupSchema),
	});

        const destionationId = form.watch("destinationId");
        const currentDatabaseType = form.watch("databaseType");
        const metadata = form.watch("metadata");
        const selectedBackupFile = form.watch("backupFile");
        const requiresDecryption = selectedBackupFile?.endsWith(".gpg") ?? false;
        const rawGpgPrivateKey = form.watch("gpgPrivateKey");
        const rawGpgPassphrase = form.watch("gpgPassphrase");
        const [selectedGpgKeyId, setSelectedGpgKeyId] = useState<string>(MANUAL_GPG_KEY_OPTION);
        const selectedGpgKey = useMemo(
                () => gpgKeys.find((key) => key.gpgKeyId === selectedGpgKeyId),
                [gpgKeys, selectedGpgKeyId],
        );
        const appliedGpgKeySignatureRef = useRef<string | null>(null);
        const gpgPrivateKeyValue =
                requiresDecryption && rawGpgPrivateKey
                        ? rawGpgPrivateKey.trim().length > 0
                                ? rawGpgPrivateKey.trim()
                                : undefined
                        : undefined;
        const gpgPassphraseValue =
                requiresDecryption && rawGpgPassphrase
                        ? rawGpgPassphrase.trim().length > 0
                                ? rawGpgPassphrase.trim()
                                : undefined
                        : undefined;

        useEffect(() => {
                if (!isOpen) {
                        setSelectedGpgKeyId(MANUAL_GPG_KEY_OPTION);
                        appliedGpgKeySignatureRef.current = null;
                        form.setValue("gpgPrivateKey", "", {
                                shouldDirty: false,
                                shouldTouch: false,
                                shouldValidate: false,
                        });
                        form.setValue("gpgPassphrase", "", {
                                shouldDirty: false,
                                shouldTouch: false,
                                shouldValidate: false,
                        });
                }
        }, [isOpen, form]);

        useEffect(() => {
                if (!requiresDecryption) {
                        setSelectedGpgKeyId(MANUAL_GPG_KEY_OPTION);
                        appliedGpgKeySignatureRef.current = null;
                        form.setValue("gpgPrivateKey", "", {
                                shouldDirty: false,
                                shouldTouch: false,
                                shouldValidate: false,
                        });
                        form.setValue("gpgPassphrase", "", {
                                shouldDirty: false,
                                shouldTouch: false,
                                shouldValidate: false,
                        });
                        return;
                }

                if (selectedGpgKeyId === MANUAL_GPG_KEY_OPTION) {
                        appliedGpgKeySignatureRef.current = null;
                        return;
                }

                if (!selectedGpgKey) {
                        return;
                }

                const signature = `${selectedGpgKeyId}:${selectedGpgKey.privateKey ?? ""}:${selectedGpgKey.passphrase ?? ""}`;

                if (appliedGpgKeySignatureRef.current === signature) {
                        return;
                }

                const privateKeyValue = selectedGpgKey.privateKey ?? "";
                const passphraseValue = selectedGpgKey.passphrase ?? "";

                if ((form.getValues("gpgPrivateKey") ?? "") !== privateKeyValue) {
                        form.setValue("gpgPrivateKey", privateKeyValue, {
                                shouldDirty: privateKeyValue.length > 0,
                                shouldTouch: true,
                                shouldValidate: true,
                        });
                }

                if ((form.getValues("gpgPassphrase") ?? "") !== passphraseValue) {
                        form.setValue("gpgPassphrase", passphraseValue, {
                                shouldDirty: passphraseValue.length > 0,
                                shouldTouch: true,
                                shouldValidate: true,
                        });
                }

                appliedGpgKeySignatureRef.current = signature;
        }, [requiresDecryption, selectedGpgKeyId, selectedGpgKey, form]);

        useEffect(() => {
                if (selectedGpgKeyId !== MANUAL_GPG_KEY_OPTION && !selectedGpgKey) {
                        setSelectedGpgKeyId(MANUAL_GPG_KEY_OPTION);
                }
        }, [selectedGpgKeyId, selectedGpgKey]);

	const debouncedSetSearch = debounce((value: string) => {
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
                        gpgPrivateKey: gpgPrivateKeyValue,
                        gpgPassphrase: gpgPassphraseValue,
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

	const onSubmit = async (data: z.infer<typeof RestoreBackupSchema>) => {
                if (backupType === "compose" && !data.databaseType) {
                        toast.error("Please select a database type");
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
					Restore Backup
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center">
						<RotateCcw className="mr-2 size-4" />
						Restore Backup
					</DialogTitle>
					<DialogDescription>
						Select a destination and search for backup files
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
									<FormLabel>Destination</FormLabel>
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
														: "Select Destination"}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Search destinations..."
													className="h-9"
												/>
												<CommandEmpty>No destinations found.</CommandEmpty>
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
										Search Backup Files
										{field.value && (
											<Badge variant="outline" className="truncate">
												{field.value}
												<Copy
													className="ml-2 size-4 cursor-pointer"
													onClick={(e) => {
														e.stopPropagation();
														e.preventDefault();
														copy(field.value);
														toast.success("Backup file copied to clipboard");
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
														{field.value || "Search and select a backup file"}
													</span>
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Search backup files..."
													value={search}
													onValueChange={handleSearchChange}
													className="h-9"
												/>
												{isLoading ? (
													<div className="py-6 text-center text-sm">
														Loading backup files...
													</div>
												) : files.length === 0 && search ? (
													<div className="py-6 text-center text-sm text-muted-foreground">
														No backup files found for "{search}"
													</div>
												) : files.length === 0 ? (
													<div className="py-6 text-center text-sm text-muted-foreground">
														No backup files available
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
																				Size: {formatBytes(file.Size)}
																			</span>
																			{file.IsDir && (
																				<span className="text-blue-500">
																					Directory
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

                                                {requiresDecryption && (
                                                        <>
                                                                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
                                                                        <div className="flex flex-col gap-2">
                                                                                <FormLabel>Saved GPG Key</FormLabel>
                                                                                <Select
                                                                                        value={selectedGpgKeyId}
                                                                                        onValueChange={(value) => {
                                                                                                setSelectedGpgKeyId(value);
                                                                                                if (value !== selectedGpgKeyId) {
                                                                                                        appliedGpgKeySignatureRef.current = null;
                                                                                                }
                                                                                        }}
                                                                                        disabled={isLoadingGpgKeys}
                                                                                >
                                                                                        <SelectTrigger>
                                                                                                <SelectValue
                                                                                                        placeholder={
                                                                                                                isLoadingGpgKeys
                                                                                                                        ? "Loading keys..."
                                                                                                                        : gpgKeys.length === 0
                                                                                                                                ? "No saved keys"
                                                                                                                                : "Select a saved key"
                                                                                                        }
                                                                                                />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent>
                                                                                                <SelectItem value={MANUAL_GPG_KEY_OPTION}>
                                                                                                        Manual entry
                                                                                                </SelectItem>
                                                                                                {gpgKeys.map((gpgKey) => (
                                                                                                        <SelectItem key={gpgKey.gpgKeyId} value={gpgKey.gpgKeyId}>
                                                                                                                <div className="flex flex-col gap-0.5">
                                                                                                                        <span className="font-medium">{gpgKey.name}</span>
                                                                                                                        {gpgKey.description ? (
                                                                                                                                <span className="text-xs text-muted-foreground">{gpgKey.description}</span>
                                                                                                                        ) : null}
                                                                                                                        <span className="text-xs text-muted-foreground">
                                                                                                                                {gpgKey.privateKey ? "Secret stored" : "Secret not stored"}
                                                                                                                                {" "}·{" "}
                                                                                                                                {gpgKey.passphrase ? "Passphrase stored" : "No passphrase stored"}
                                                                                                                        </span>
                                                                                                                </div>
                                                                                                        </SelectItem>
                                                                                                ))}
                                                                                        </SelectContent>
                                                                                </Select>
                                                                                <p className="text-xs text-muted-foreground">
                                                                                        {selectedGpgKeyId === MANUAL_GPG_KEY_OPTION
                                                                                                ? "Paste the matching private key and passphrase below to decrypt the backup."
                                                                                                : selectedGpgKey?.privateKey
                                                                                                        ? "The stored secret has been copied below — feel free to adjust it before starting the restore."
                                                                                                        : "This key doesn't include a stored private key, so paste it manually below."}
                                                                                </p>
                                                                        </div>
                                                                </div>
                                                                <FormField
                                                                        control={form.control}
                                                                        name="gpgPrivateKey"
                                                                        render={({ field }) => (
                                                                                <FormItem>
                                                                                        <FormLabel>GPG Private Key</FormLabel>
                                                                                        <FormControl>
                                                                                                <Textarea
                                                                                                        placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"
                                                                                                        className="min-h-[150px]"
                                                                                                        {...field}
                                                                                                />
                                                                                        </FormControl>
                                                                                        <FormDescription>
                                                                                                Paste the private key that matches the public key used to encrypt the backup.
                                                                                        </FormDescription>
                                                                                        <FormMessage />
                                                                                </FormItem>
                                                                        )}
                                                                />
                                                                <FormField
                                                                        control={form.control}
                                                                        name="gpgPassphrase"
                                                                        render={({ field }) => (
                                                                                <FormItem>
                                                                                        <FormLabel>GPG Passphrase (optional)</FormLabel>
                                                                                        <FormControl>
                                                                                                <Input
                                                                                                        type="password"
                                                                                                        placeholder="Enter passphrase if required"
                                                                                                        autoComplete="off"
                                                                                                        {...field}
                                                                                                />
                                                                                        </FormControl>
                                                                                        <FormDescription>
                                                                                                Leave empty if the private key is not protected with a passphrase.
                                                                                        </FormDescription>
                                                                                        <FormMessage />
                                                                                </FormItem>
                                                                        )}
                                                                />
                                                        </>
                                                )}
                                                <FormField
                                                        control={form.control}
                                                        name="databaseName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Database Name</FormLabel>
									<FormControl>
										<Input
											placeholder="Enter database name"
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
											<FormLabel>Database Type</FormLabel>
											<Select
												value={field.value}
												onValueChange={(value: DatabaseType) => {
													field.onChange(value);
													form.setValue("metadata", {});
												}}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select database type" />
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
											<FormLabel>Service Name</FormLabel>
											<div className="flex gap-2">
												<Select
													onValueChange={field.onChange}
													value={field.value || undefined}
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
														{(!services || services.length === 0) && (
															<SelectItem value="none" disabled>
																Empty
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

								{currentDatabaseType === "postgres" && (
									<FormField
										control={form.control}
										name="metadata.postgres.databaseUser"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Database User</FormLabel>
												<FormControl>
													<Input placeholder="Enter database user" {...field} />
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
													<FormLabel>Database User</FormLabel>
													<FormControl>
														<Input
															placeholder="Enter database user"
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
													<FormLabel>Database Password</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="Enter database password"
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
													<FormLabel>Database User</FormLabel>
													<FormControl>
														<Input
															placeholder="Enter database user"
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
													<FormLabel>Database Password</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="Enter database password"
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
												<FormLabel>Root Password</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder="Enter root password"
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
								Restore
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
