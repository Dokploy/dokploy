import {
	type LogLine,
	parseLogs,
} from "@/components/dashboard/docker/logs/utils";
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
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { debounce } from "lodash";
import { CheckIcon, ChevronsUpDown, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface BackupFile {
	path: string;
	name: string;
	size: number;
	isDir: boolean;
	hashes?: {
		MD5: string;
	};
	lastModified: string;
}

type DatabaseType = "postgres" | "mariadb" | "mysql" | "mongo" | "web-server";

interface Props {
	databaseId: string;
	databaseType: DatabaseType;
}

const restoreBackupSchema = z
	.object({
		backupId: z.string().min(1, "Backup is required"),
		backupFile: z.string().min(1, "Backup file is required"),
		databaseName: z.string().min(1, "Database name is required"),
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
		if (data.metadata?.postgres && !data.metadata.postgres.databaseUser) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Database user is required for PostgreSQL",
				path: ["metadata", "postgres", "databaseUser"],
			});
		}
		if (data.metadata?.mariadb) {
			if (!data.metadata.mariadb.databaseUser) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Database user is required for MariaDB",
					path: ["metadata", "mariadb", "databaseUser"],
				});
			}
			if (!data.metadata.mariadb.databasePassword) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Database password is required for MariaDB",
					path: ["metadata", "mariadb", "databasePassword"],
				});
			}
		}
		if (data.metadata?.mongo) {
			if (!data.metadata.mongo.databaseUser) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Database user is required for MongoDB",
					path: ["metadata", "mongo", "databaseUser"],
				});
			}
			if (!data.metadata.mongo.databasePassword) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Database password is required for MongoDB",
					path: ["metadata", "mongo", "databasePassword"],
				});
			}
		}
		if (data.metadata?.mysql && !data.metadata.mysql.databaseRootPassword) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Root password is required for MySQL",
				path: ["metadata", "mysql", "databaseRootPassword"],
			});
		}
	});

const formatBytes = (bytes: number): string => {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

export const RestoreCloudBackup = ({ databaseId, databaseType }: Props) => {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
	const [selectedBackup, setSelectedBackup] = useState<any>(null);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);
	const [isFilePopoverOpen, setIsFilePopoverOpen] = useState(false);

	const { data: cloudBackups } = api.cloudStorageBackup.list.useQuery();

	const { data: backupFiles, isLoading: isLoadingFiles } =
		api.cloudStorageBackup.listBackupFiles.useQuery(
			{
				destinationId: selectedBackup?.cloudStorageDestinationId || "",
				prefix: selectedBackup?.prefix || "",
				searchTerm: debouncedSearchTerm,
			},
			{
				enabled: !!selectedBackup?.cloudStorageDestinationId,
				onSuccess: (data) => {
					console.log("Backup files loaded:", data);
				},
				onError: (error) => {
					console.error("Error loading backup files:", error);
				},
			},
		);

	const { mutateAsync: restoreBackup } =
		api.cloudStorageBackup.restore.useMutation();

	const form = useForm<z.infer<typeof restoreBackupSchema>>({
		resolver: zodResolver(restoreBackupSchema),
		defaultValues: {
			backupId: "",
			backupFile: "",
			databaseName: databaseType === "web-server" ? "dokploy" : "",
			metadata: {},
		},
	});

	const debouncedSetSearch = debounce((value: string) => {
		setDebouncedSearchTerm(value);
	}, 350);

	const handleSearchChange = (value: string) => {
		setSearch(value);
		debouncedSetSearch(value);
	};

	const handleBackupSelect = (backup: any) => {
		console.log("Selected backup:", backup);
		form.setValue("backupId", backup.id);
		setSelectedBackup(backup);
		setSearch("");
		setDebouncedSearchTerm("");
	};

	api.cloudStorageBackup.restoreBackupWithLogs.useSubscription(
		{
			databaseId,
			databaseType,
			databaseName: form.watch("databaseName"),
			backupFile: form.watch("backupFile"),
			destinationId: selectedBackup?.cloudStorageDestinationId || "",
			metadata: form.watch("metadata"),
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

	const filteredBackups = cloudBackups?.filter((backup) => {
		const matchesType = (() => {
			switch (databaseType) {
				case "postgres":
					return backup.postgresId === databaseId;
				case "mysql":
					return backup.mysqlId === databaseId;
				case "mariadb":
					return backup.mariadbId === databaseId;
				case "mongo":
					return backup.mongoId === databaseId;
				case "web-server":
					return backup.databaseType === "web-server";
				default:
					return false;
			}
		})();

		const matchesSearch = search
			? backup.database?.toLowerCase().includes(search.toLowerCase()) ||
				backup.cloudStorageDestination?.name
					?.toLowerCase()
					.includes(search.toLowerCase())
			: true;

		return matchesType && matchesSearch;
	});

	const onSubmit = async (values: z.infer<typeof restoreBackupSchema>) => {
		if (!selectedBackup) {
			toast.error("Please select a valid backup");
			return;
		}
		setIsDeploying(true);
		try {
			const remoteName = (() => {
				switch (selectedBackup.cloudStorageDestination?.provider) {
					case "drive":
						return "drive";
					case "dropbox":
						return "dropbox";
					case "box":
						return "box";
					case "ftp":
						return "ftp";
					case "sftp":
						return "sftp";
					default:
						return selectedBackup.cloudStorageDestination?.provider;
				}
			})();

			const backupPath = `${remoteName}:${values.backupFile}`;

			await restoreBackup({
				destinationId: selectedBackup.cloudStorageDestinationId,
				backupFile: backupPath,
				databaseType,
				databaseName: values.databaseName,
				metadata: values.metadata,
			});
			toast.success("Backup restore initiated successfully");
			setOpen(false);
		} catch (error) {
			console.error("Restore error:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to restore backup",
			);
		} finally {
			setIsDeploying(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(newOpen) => {
				setOpen(newOpen);
				if (!newOpen) {
					// Reset form and state when dialog is closed
					form.reset();
					setSelectedBackup(null);
					setSearch("");
					setDebouncedSearchTerm("");
					setIsFilePopoverOpen(false);
					setFilteredLogs([]);
					setIsDeploying(false);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline">
					<RotateCcw className="mr-2 size-4" />
					Restore Backup
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center">
						<Button
							variant="secondary"
							size="icon"
							className="mr-2"
							onClick={() => {
								form.reset();
								setSelectedBackup(null);
								setSearch("");
								setDebouncedSearchTerm("");
							}}
						>
							<RotateCcw className="size-4" />
						</Button>
						Restore Cloud Backup
					</DialogTitle>
					<DialogDescription>
						Select a backup to restore from your cloud storage destination.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="hook-form-restore-cloud-backup"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<FormField
							control={form.control}
							name="backupId"
							render={({ field }) => (
								<FormItem className="">
									<FormLabel>Backup</FormLabel>
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
														? `${
																filteredBackups?.find(
																	(backup) => backup.id === field.value,
																)?.cloudStorageDestination?.name
															} - ${
																filteredBackups?.find(
																	(backup) => backup.id === field.value,
																)?.database
															}`
														: "Select backup"}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0" align="start">
											<Command>
												<CommandInput
													placeholder="Search backups..."
													value={search}
													onValueChange={handleSearchChange}
													className="h-9"
												/>
												<CommandEmpty>No backups found.</CommandEmpty>
												<ScrollArea className="h-64">
													<CommandGroup>
														{filteredBackups?.map((backup) => (
															<CommandItem
																value={backup.id}
																key={backup.id}
																onSelect={() => handleBackupSelect(backup)}
															>
																<CheckIcon
																	className={cn(
																		"mr-2 h-4 w-4",
																		backup.id === field.value
																			? "opacity-100"
																			: "opacity-0",
																	)}
																/>
																{backup.cloudStorageDestination?.name} -{" "}
																{backup.database}
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
										<span>Search Backup Files</span>
									</FormLabel>
									<Popover
										modal
										open={isFilePopoverOpen}
										onOpenChange={setIsFilePopoverOpen}
									>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													className={cn(
														"w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
													disabled={!selectedBackup}
													onClick={() => {
														setSearch("");
														setDebouncedSearchTerm("");
													}}
												>
													{field.value || "Select a backup destination first"}
													<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="p-0 w-[500px]" align="start">
											<Command>
												<CommandInput
													placeholder="Search backup files..."
													value={search}
													onValueChange={handleSearchChange}
													className="h-9"
												/>
												{isLoadingFiles ? (
													<div className="flex items-center justify-center py-6">
														<div className="flex flex-col items-center gap-2">
															<div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
															<span className="text-sm text-muted-foreground">
																Loading backup files...
															</span>
														</div>
													</div>
												) : backupFiles?.length === 0 && search ? (
													<div className="flex flex-col items-center justify-center py-6 text-center">
														<span className="text-sm text-muted-foreground">
															No backup files found for "{search}"
														</span>
														<Button
															variant="ghost"
															size="sm"
															className="mt-2"
															onClick={() => {
																setSearch("");
																setDebouncedSearchTerm("");
															}}
														>
															Clear search
														</Button>
													</div>
												) : backupFiles?.length === 0 ? (
													<div className="flex flex-col items-center justify-center py-6 text-center">
														<span className="text-sm text-muted-foreground">
															No backup files available
														</span>
														<span className="mt-1 text-xs text-muted-foreground">
															Make sure you have backup files in the selected
															destination
														</span>
													</div>
												) : (
													<ScrollArea className="h-64">
														<CommandGroup>
															{backupFiles
																?.sort(
																	(a: BackupFile, b: BackupFile) =>
																		new Date(b.lastModified).getTime() -
																		new Date(a.lastModified).getTime(),
																)
																.map((file: BackupFile) => (
																	<CommandItem
																		value={file.path}
																		key={file.path}
																		onSelect={() => {
																			console.log("Selected file:", file.path);
																			form.setValue("backupFile", file.path);
																			setSearch("");
																			setDebouncedSearchTerm("");
																			setIsFilePopoverOpen(false);
																		}}
																		className="flex flex-col items-start gap-1 p-2"
																	>
																		<div className="flex w-full items-center justify-between">
																			<span className="font-medium truncate max-w-[250px]">
																				{file.name}
																			</span>
																			<div className="flex flex-col items-end">
																				<Badge variant="outline">
																					{new Date(
																						file.lastModified,
																					).toLocaleDateString()}
																				</Badge>
																				<span className="text-xs text-muted-foreground mt-1">
																					{new Date(
																						file.lastModified,
																					).toLocaleTimeString()}
																				</span>
																			</div>
																		</div>
																		<div className="flex items-center gap-4 text-xs text-muted-foreground">
																			<span className="flex items-center gap-1">
																				<span className="font-medium">
																					Size:
																				</span>
																				{formatBytes(file.size)}
																			</span>
																			{file.isDir && (
																				<span className="flex items-center gap-1 text-blue-500">
																					<span className="font-medium">
																						Type:
																					</span>
																					Directory
																				</span>
																			)}
																			{file.hashes?.MD5 && (
																				<span className="flex items-center gap-1">
																					<span className="font-medium">
																						MD5:
																					</span>
																					<span className="font-mono">
																						{file.hashes.MD5}
																					</span>
																				</span>
																			)}
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

						{databaseType === "postgres" && (
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

						{databaseType === "mariadb" && (
							<>
								<FormField
									control={form.control}
									name="metadata.mariadb.databaseUser"
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

						{databaseType === "mongo" && (
							<>
								<FormField
									control={form.control}
									name="metadata.mongo.databaseUser"
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

						{databaseType === "mysql" && (
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

						<DialogFooter>
							<Button
								isLoading={isDeploying}
								form="hook-form-restore-cloud-backup"
								type="submit"
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
					}}
					filteredLogs={filteredLogs}
				/>
			</DialogContent>
		</Dialog>
	);
};
