import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import debounce from "lodash/debounce";
import {
	Archive,
	CheckIcon,
	ChevronsUpDown,
	CloudCog,
	Copy,
	Info,
	RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/utils/api";
import { getS3StorageClassLabel } from "../../database/backups/constants";
import { formatBytes } from "../../database/backups/restore-backup";
import { type LogLine, parseLogs } from "../../docker/logs/utils";

interface Props {
	id: string;
	type: "application" | "compose";
	serverId?: string;
}

type BackupFileListItem = RouterOutputs["backup"]["listBackupFiles"][number] & {
	RestoreAvailability?: "ready" | "restoring" | "archived" | "unknown";
	StorageClass?: string;
	RestoreExpiryDate?: string | null;
};
const readableUntilClass =
	"inline-flex rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300";

const RestoreBackupSchema = z.object({
	destinationId: z.string().min(1, {
		message: "Destination is required",
	}),
	backupFile: z.string().min(1, {
		message: "Backup file is required",
	}),
	volumeName: z.string().min(1, {
		message: "Volume name is required",
	}),
});

const getAvailabilityBadge = (
	availability?: "ready" | "restoring" | "archived" | "unknown",
) => {
	if (availability === "ready") {
		return <Badge variant="default">Ready</Badge>;
	}
	if (availability === "restoring") {
		return <Badge variant="secondary">Restoring</Badge>;
	}
	if (availability === "archived") {
		return <Badge variant="destructive">Archived</Badge>;
	}
	return <Badge variant="outline">Unknown</Badge>;
};

export const RestoreVolumeBackups = ({ id, type, serverId }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

	const { data: destinations = [] } = api.destination.all.useQuery();

	const form = useForm({
		defaultValues: {
			destinationId: "",
			backupFile: "",
			volumeName: "",
		},
		resolver: zodResolver(RestoreBackupSchema),
	});

	const destinationId = form.watch("destinationId");
	const volumeName = form.watch("volumeName");
	const backupFile = form.watch("backupFile");

	const debouncedSetSearch = debounce((value: string) => {
		setDebouncedSearchTerm(value);
	}, 350);

	const handleSearchChange = (value: string) => {
		setSearch(value);
		debouncedSetSearch(value);
	};

	const {
		data: filesData = [],
		isLoading,
		refetch: refetchFiles,
	} = api.backup.listBackupFiles.useQuery(
		{
			destinationId: destinationId,
			search: debouncedSearchTerm,
			serverId: serverId ?? "",
		},
		{
			enabled: isOpen && !!destinationId,
		},
	);
	const files = filesData as BackupFileListItem[];

	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);
	const [archiveRetrievalTier, setArchiveRetrievalTier] = useState<
		"standard" | "priority" | "bulk"
	>("standard");
	const [archiveLifetimeDays, setArchiveLifetimeDays] = useState("7");
	const selectedFile = files.find((file) => file.Path === backupFile);
	const isSelectedFileRestorable =
		selectedFile && !selectedFile.IsDir
			? selectedFile.RestoreAvailability === "ready" ||
				selectedFile.RestoreAvailability === "unknown"
			: true;

	api.volumeBackups.restoreVolumeBackupWithLogs.useSubscription(
		{
			id,
			serviceType: type,
			serverId,
			destinationId,
			volumeName,
			backupFileName: backupFile,
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

	const requestArchiveRestore = api.backup.requestBackupFileRestore.useMutation({
		onSuccess(data) {
			toast.success(data.message);
			void refetchFiles();
		},
		onError(error) {
			toast.error(error.message);
		},
	});

	const onSubmit = async () => {
		setIsDeploying(true);
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<RotateCcw className="mr-2 size-4" />
					Restore Volume Backup
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center">
						<RotateCcw className="mr-2 size-4" />
						Restore Volume Backup
					</DialogTitle>
					<DialogDescription>
						Select a destination and search for volume backup files
					</DialogDescription>
					<AlertBlock>
						Make sure the volume name is not being used by another container.
					</AlertBlock>
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
									<FormLabel className="flex items-center justify-between gap-2">
										<span className="shrink-0">Search Backup Files</span>
										{field.value && (
											<Badge
												variant="outline"
												className="max-w-52 min-w-0 flex items-center gap-1"
											>
												<span className="truncate">{field.value}</span>
												<Copy
													className="size-4 shrink-0 cursor-pointer"
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
														"h-10 w-full justify-between !bg-input",
														!field.value && "text-muted-foreground",
													)}
												>
													<span className="block flex-1 truncate whitespace-nowrap text-left">
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
																		<div className="flex w-full justify-between items-center">
																			<span className="font-medium truncate min-w-0">
																				{file.Path}
																			</span>

																			<CheckIcon
																				className={cn(
																					"ml-2 h-4 w-4 shrink-0",
																					file.Path === field.value
																						? "opacity-100"
																						: "opacity-0",
																				)}
																			/>
																		</div>
																		<div className="flex w-full items-center gap-x-4 text-xs text-muted-foreground min-w-0">
																			<span className="shrink-0">
																				Size: {formatBytes(file.Size)}
																			</span>
																			{(file.StorageClass || file.Tier) && (
																				<span className="shrink-0">
																					Class:{" "}
																					{getS3StorageClassLabel(
																						(file.StorageClass || file.Tier) ?? "",
																					)}
																				</span>
																			)}
																			<span className="ml-auto shrink-0">
																				{!file.IsDir ? (
																					getAvailabilityBadge(file.RestoreAvailability)
																				) : (
																					<span className="text-blue-500">
																						Directory
																					</span>
																				)}
																			</span>
																		</div>
																		{(file.Hashes?.MD5 || file.RestoreExpiryDate) && (
																			<div className="flex flex-wrap items-center gap-x-4 text-xs text-muted-foreground">
																				{file.Hashes?.MD5 && (
																					<span>MD5: {file.Hashes.MD5}</span>
																				)}
																				{file.RestoreExpiryDate && (
																					<span className={readableUntilClass}>
																						Readable until:{" "}
																						{new Date(
																							file.RestoreExpiryDate,
																						).toLocaleString()}
																					</span>
																				)}
																			</div>
																		)}
																			{file.IsDir && (
																				<span className="text-xs text-muted-foreground">
																					Folder prefix
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
							name="volumeName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Volume Name</FormLabel>
									<FormControl>
										<Input placeholder="Enter volume name" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								isLoading={isDeploying}
								form="hook-form-restore-backup"
								type="submit"
								disabled={!backupFile || !isSelectedFileRestorable}
							>
								Restore
							</Button>
						</DialogFooter>
						{selectedFile?.RestoreAvailability === "archived" && (
							<Card className="border-amber-500/40 bg-amber-500/5 dark:border-amber-400/30 dark:bg-amber-400/10">
								<CardHeader className="pb-2">
									<CardTitle className="flex items-center gap-2 text-sm font-medium">
										<Archive className="size-4 text-amber-600 dark:text-amber-400" />
										Restore from archive (AWS)
									</CardTitle>
									<CardDescription className="text-xs">
										This backup is in cold storage (e.g. Glacier). Request a
										temporary restore so it can be downloaded. Retrieval
										typically takes 3-12 hours for Standard, or 1-5 minutes for
										Expedited.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-3 pt-0">
									<div className="flex flex-col gap-3">
										<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
											<div className="space-y-1.5">
												<label className="text-xs font-medium text-muted-foreground">
													Retrieval tier
												</label>
												<Select
													value={archiveRetrievalTier}
													onValueChange={(value: "standard" | "priority" | "bulk") =>
														setArchiveRetrievalTier(value)
													}
												>
													<SelectTrigger className="h-9 w-full sm:w-56">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="standard">
															Standard (3-5 hours, lower cost)
														</SelectItem>
														<SelectItem value="priority">
															Expedited (1-5 minutes)
														</SelectItem>
														<SelectItem value="bulk">
															Bulk (5-12 hours, lowest cost)
														</SelectItem>
													</SelectContent>
												</Select>
											</div>
											<div className="space-y-1.5">
												<label className="text-xs font-medium text-muted-foreground">
													Restore duration
												</label>
												<Select
													value={archiveLifetimeDays}
													onValueChange={setArchiveLifetimeDays}
												>
													<SelectTrigger className="h-9 w-full sm:w-32">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="1">1 day</SelectItem>
														<SelectItem value="3">3 days</SelectItem>
														<SelectItem value="7">7 days</SelectItem>
														<SelectItem value="14">14 days</SelectItem>
														<SelectItem value="30">30 days</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</div>
										<Button
											type="button"
											className="w-full sm:w-fit"
											isLoading={requestArchiveRestore.isPending}
											onClick={() => {
												if (!selectedFile) return;
												requestArchiveRestore.mutate({
													destinationId,
													backupFile: selectedFile.Path,
													retrievalTier: archiveRetrievalTier,
													lifetimeDays: Number.parseInt(archiveLifetimeDays, 10),
													serverId: serverId ?? undefined,
												});
											}}
										>
											<CloudCog className="mr-2 size-4" />
											Request restore from AWS
										</Button>
									</div>
									<p className="text-xs text-muted-foreground">
										After the request completes, the file will be available for
										download. You can then run the restore above when it shows
										Ready.
									</p>
								</CardContent>
							</Card>
						)}
						{selectedFile?.RestoreAvailability === "restoring" && (
							<Alert className="border-blue-500/40 bg-blue-500/5 dark:border-blue-400/30 dark:bg-blue-400/10">
								<Info className="size-4 text-blue-600 dark:text-blue-400" />
								<AlertTitle className="text-sm">
									Restore from archive in progress
								</AlertTitle>
								<AlertDescription className="text-xs">
									This backup is being restored from cold storage. It usually
									takes a few hours. You can close this dialog and come back
									later, when the backup shows Ready, you can run the restore.
								</AlertDescription>
							</Alert>
						)}
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
