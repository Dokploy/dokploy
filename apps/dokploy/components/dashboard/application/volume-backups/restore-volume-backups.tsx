import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import copy from "copy-to-clipboard";
import { CheckIcon, ChevronsUpDown, Copy, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { BackupFilePicker } from "@/components/shared/backup-file-picker";
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
import { type LogLine, parseLogs } from "../../docker/logs/utils";

interface Props {
	id: string;
	type: "application" | "compose";
	serverId?: string;
	trigger?: React.ReactNode;
}

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

export const RestoreVolumeBackups = ({
	id,
	type,
	serverId,
	trigger,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);

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

	useEffect(() => {
		form.setValue("backupFile", "");
	}, [destinationId, serverId, id, type, form]);

	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const [isDeploying, setIsDeploying] = useState(false);

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

	const onSubmit = async () => {
		setIsDeploying(true);
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button variant="outline">
						<RotateCcw className="mr-2 size-4" />
						Restore Volume Backup
					</Button>
				)}
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
						className="grid w-full grid-cols-1 gap-4"
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
														"w-full justify-between",
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
												className="min-w-0 max-w-[70%] shrink"
											>
												<span className="min-w-0 truncate">{field.value}</span>
												<Copy
													className="ml-2 size-4 shrink-0 cursor-pointer"
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
									<BackupFilePicker
										key={JSON.stringify([id, destinationId, serverId, type])}
										destinationId={destinationId}
										serverId={serverId}
										enabled={isOpen}
										value={field.value}
										onChange={(path) => form.setValue("backupFile", path)}
									/>
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
