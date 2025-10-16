import { zodResolver } from "@hookform/resolvers/zod";
import copy from "copy-to-clipboard";
import { debounce } from "lodash";
import { CheckIcon, ChevronsUpDown, Copy, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { formatBytes } from "../../database/backups/restore-backup";
import { type LogLine, parseLogs } from "../../docker/logs/utils";

interface Props {
        id: string;
        type: "application" | "compose";
        serverId?: string;
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
volumeName: z
.string({
required_error: "Please enter a volume name",
})
.min(1, {
message: "Volume name is required",
}),
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
})
.superRefine((data, ctx) => {
if (data.backupFile.endsWith(".gpg") && !data.gpgPrivateKey) {
ctx.addIssue({
code: z.ZodIssueCode.custom,
message: "A GPG private key is required to restore encrypted backups",
path: ["gpgPrivateKey"],
});
}
});

export const RestoreVolumeBackups = ({ id, type, serverId }: Props) => {
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
                        volumeName: "",
                        gpgPrivateKey: "",
                        gpgPassphrase: "",
                },
                resolver: zodResolver(RestoreBackupSchema),
        });

        const destinationId = form.watch("destinationId");
        const volumeName = form.watch("volumeName");
        const backupFile = form.watch("backupFile");
        const requiresDecryption = backupFile?.endsWith(".gpg") ?? false;
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
			destinationId: destinationId,
			search: debouncedSearchTerm,
			serverId: serverId ?? "",
		},
		{
			enabled: isOpen && !!destinationId,
		},
	);

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
									<FormLabel className="flex items-center">
										Search Backup Files
										{field.value && (
											<Badge variant="outline" className="truncate w-52">
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
                                                )}

                                                {requiresDecryption && (
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
											The private key that matches the public key used to encrypt this backup.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						{requiresDecryption && (
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
											Leave empty if the private key does not require a passphrase.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

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
