import { zodResolver } from "@hookform/resolvers/zod";
import { DatabaseZap, PenBoxIcon, PlusCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import type { CacheType } from "../domains/handle-domain";
import { ScheduleFormField } from "../schedules/handle-schedules";

const NO_GPG_KEY_VALUE = "__no_gpg_key__";

const formSchema = z
        .object({
                name: z.string().min(1, "Name is required"),
                cronExpression: z.string().min(1, "Cron expression is required"),
                volumeName: z.string().min(1, "Volume name is required"),
                prefix: z.string(),
		keepLatestCount: z.coerce
			.number()
			.int()
			.gte(1, "Must be at least 1")
			.optional()
			.nullable(),
		turnOff: z.boolean().default(false),
		enabled: z.boolean().default(true),
                serviceType: z.enum([
                        "application",
                        "compose",
                        "postgres",
                        "mariadb",
                        "mongo",
                        "mysql",
                        "redis",
                ]),
                serviceName: z.string(),
                destinationId: z.string().min(1, "Destination required"),
                gpgKeyId: z.string().optional(),
                gpgPublicKey: z
                        .string()
                        .optional()
                        .transform((value) => {
                                if (!value) return undefined;
                                const trimmed = value.trim();
                                return trimmed.length > 0 ? trimmed : undefined;
                        }),
        })
        .superRefine((data, ctx) => {
                if (data.serviceType === "compose" && !data.serviceName) {
                        ctx.addIssue({
                                code: z.ZodIssueCode.custom,
				message: "Service name is required",
				path: ["serviceName"],
			});
		}

                if (data.serviceType === "compose" && !data.serviceName) {
                        ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: "Service name is required",
                                path: ["serviceName"],
                        });
                }

                if (data.gpgKeyId === "custom" && !data.gpgPublicKey) {
                        ctx.addIssue({
                                code: z.ZodIssueCode.custom,
                                message: "Provide a public key when using a custom GPG key",
                                path: ["gpgPublicKey"],
                        });
                }
        });

interface Props {
	id?: string;
	volumeBackupId?: string;
	volumeBackupType?:
		| "application"
		| "compose"
		| "postgres"
		| "mariadb"
		| "mongo"
		| "mysql"
		| "redis";
}

export const HandleVolumeBackups = ({
	id,
	volumeBackupId,
	volumeBackupType,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const [keepLatestCountInput, setKeepLatestCountInput] = useState("");

	const utils = api.useUtils();
        const form = useForm<z.infer<typeof formSchema>>({
                resolver: zodResolver(formSchema),
                defaultValues: {
                        name: "",
                        cronExpression: "",
                        volumeName: "",
                        prefix: "",
                        keepLatestCount: undefined,
                        turnOff: false,
                        enabled: true,
                        serviceName: "",
                        serviceType: volumeBackupType,
                        gpgKeyId: "",
                        gpgPublicKey: "",
                },
        });

        const serviceTypeForm = volumeBackupType;
        const { data: destinations } = api.destination.all.useQuery();
        const { data: volumeBackup } = api.volumeBackups.one.useQuery(
                { volumeBackupId: volumeBackupId || "" },
                { enabled: !!volumeBackupId },
        );

        const { data: gpgKeys, isLoading: isLoadingGpgKeys } = api.gpgKey.all.useQuery();

	const { data: mounts } = api.mounts.allNamedByApplicationId.useQuery(
		{ applicationId: id || "" },
		{ enabled: !!id && volumeBackupType === "application" },
	);

	const {
		data: services,
		isFetching: isLoadingServices,
		error: errorServices,
		refetch: refetchServices,
	} = api.compose.loadServices.useQuery(
		{
			composeId: id || "",
			type: cacheType,
		},
		{
			retry: false,
			refetchOnWindowFocus: false,
			enabled: !!id && volumeBackupType === "compose",
		},
	);

	const serviceName = form.watch("serviceName");

	const { data: mountsByService } = api.compose.loadMountsByService.useQuery(
		{
			composeId: id || "",
			serviceName,
		},
		{
			enabled: !!id && volumeBackupType === "compose" && !!serviceName,
		},
	);

        useEffect(() => {
                if (volumeBackupId && volumeBackup) {
                        const managedGpgKeyId =
                                volumeBackup.gpgKeyId || volumeBackup.gpgKey?.gpgKeyId || "";
                        const gpgSelection =
                                managedGpgKeyId || (volumeBackup.gpgPublicKey ? "custom" : "");

                        form.reset({
                                name: volumeBackup.name,
                                cronExpression: volumeBackup.cronExpression,
                                volumeName: volumeBackup.volumeName || "",
                                prefix: volumeBackup.prefix,
                                keepLatestCount: volumeBackup.keepLatestCount || undefined,
                                turnOff: volumeBackup.turnOff,
                                enabled: volumeBackup.enabled || false,
                                serviceName: volumeBackup.serviceName || "",
                                destinationId: volumeBackup.destinationId,
                                serviceType: volumeBackup.serviceType,
                                gpgKeyId: gpgSelection,
                                gpgPublicKey:
                                        managedGpgKeyId && volumeBackup.gpgKey?.publicKey
                                                ? volumeBackup.gpgKey.publicKey
                                                : volumeBackup.gpgPublicKey || "",
                        });
                        setKeepLatestCountInput(
                                volumeBackup.keepLatestCount !== null &&
                                        volumeBackup.keepLatestCount !== undefined
                                        ? String(volumeBackup.keepLatestCount)
                                        : "",
			);
		}
        }, [form, volumeBackup, volumeBackupId]);

        const selectedGpgKeyId = form.watch("gpgKeyId");
        const selectedManagedGpgKey = useMemo(
                () => gpgKeys?.find((key) => key.gpgKeyId === selectedGpgKeyId),
                [gpgKeys, selectedGpgKeyId],
        );

        useEffect(() => {
                if (!selectedGpgKeyId) {
                        form.setValue("gpgPublicKey", "", { shouldDirty: false, shouldValidate: false });
                        return;
                }

                if (selectedGpgKeyId === "custom") {
                        return;
                }

                const match = gpgKeys?.find((key) => key.gpgKeyId === selectedGpgKeyId);
                if (match) {
                        form.setValue("gpgPublicKey", match.publicKey ?? "", {
                                shouldDirty: false,
                                shouldValidate: false,
                        });
                }
        }, [selectedGpgKeyId, gpgKeys, form]);

	const { mutateAsync, isLoading } = volumeBackupId
		? api.volumeBackups.update.useMutation()
		: api.volumeBackups.create.useMutation();

        const onSubmit = async (values: z.infer<typeof formSchema>) => {
                if (!id && !volumeBackupId) return;

                const preparedKeepLatestCount =
                        keepLatestCountInput === "" ? null : (values.keepLatestCount ?? null);

                const { gpgKeyId: formGpgKeyId, gpgPublicKey: formGpgPublicKey, ...restValues } =
                        values;

                const selection = formGpgKeyId?.trim();
                const usingManagedKey = !!selection && selection !== "custom";
                const managedKey = usingManagedKey
                        ? gpgKeys?.find((key) => key.gpgKeyId === selection)
                        : undefined;

                if (usingManagedKey && !managedKey) {
                        toast.error(
                                "Selected GPG key is no longer available. Please refresh and try again.",
                        );
                        return;
                }

                const resolvedGpgPublicKey = usingManagedKey
                        ? managedKey?.publicKey ?? null
                        : selection === "custom"
                                ? formGpgPublicKey ?? null
                                : null;
                const resolvedGpgKeyId = usingManagedKey ? managedKey?.gpgKeyId ?? null : null;

                await mutateAsync({
                        ...restValues,
                        keepLatestCount: preparedKeepLatestCount,
                        destinationId: restValues.destinationId,
                        volumeBackupId: volumeBackupId || "",
                        serviceType: volumeBackupType,
                        gpgKeyId: resolvedGpgKeyId,
                        gpgPublicKey: resolvedGpgPublicKey,
                        ...(volumeBackupType === "application" && {
                                applicationId: id || "",
                        }),
			...(volumeBackupType === "compose" && {
				composeId: id || "",
			}),
			...(volumeBackupType === "postgres" && {
				serverId: id || "",
			}),
			...(volumeBackupType === "postgres" && {
				postgresId: id || "",
			}),
			...(volumeBackupType === "mariadb" && {
				mariadbId: id || "",
			}),
                        ...(volumeBackupType === "mongo" && {
                                mongoId: id || "",
                        }),
			...(volumeBackupType === "mysql" && {
				mysqlId: id || "",
			}),
			...(volumeBackupType === "redis" && {
				redisId: id || "",
			}),
		})
			.then(() => {
				toast.success(
					`Volume backup ${volumeBackupId ? "updated" : "created"} successfully`,
				);
				utils.volumeBackups.list.invalidate({
					id,
					volumeBackupType,
				});
				setIsOpen(false);
			})
			.catch((error) => {
				toast.error(
					error instanceof Error ? error.message : "An unknown error occurred",
				);
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{volumeBackupId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10"
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>
						<PlusCircle className="w-4 h-4 mr-2" />
						Add Volume Backup
					</Button>
				)}
			</DialogTrigger>
			<DialogContent
				className={cn(
					volumeBackupType === "compose" || volumeBackupType === "application"
						? "sm:max-w-2xl"
						: " sm:max-w-lg",
				)}
			>
				<DialogHeader>
					<DialogTitle>
						{volumeBackupId ? "Edit" : "Create"} Volume Backup
					</DialogTitle>
					<DialogDescription>
						Create a volume backup to backup your volume to a destination
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										Task Name
									</FormLabel>
									<FormControl>
										<Input placeholder="Daily Database Backup" {...field} />
									</FormControl>
									<FormDescription>
										A descriptive name for your scheduled task
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<ScheduleFormField
							name="cronExpression"
							formControl={form.control}
						/>

						<FormField
							control={form.control}
							name="destinationId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Destination</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder="Select a destination" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{destinations?.map((destination) => (
												<SelectItem
													key={destination.destinationId}
													value={destination.destinationId}
												>
													{destination.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormDescription>
										Choose the backup destination where files will be stored
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						{serviceTypeForm === "compose" && (
							<>
								<div className="flex flex-col w-full gap-4">
									{errorServices && (
										<AlertBlock
											type="warning"
											className="[overflow-wrap:anywhere]"
										>
											{errorServices?.message}
										</AlertBlock>
									)}
									<FormField
										control={form.control}
										name="serviceName"
										render={({ field }) => (
											<FormItem className="w-full">
												<FormLabel>Service Name</FormLabel>
												<div className="flex gap-2">
													<Select
														onValueChange={field.onChange}
														defaultValue={field.value || ""}
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
															<SelectItem value="none" disabled>
																Empty
															</SelectItem>
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
																	Cache: If you previously deployed this
																	compose, it will read the services from the
																	last deployment/fetch from the repository
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
								{mountsByService && mountsByService.length > 0 && (
									<FormField
										control={form.control}
										name="volumeName"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Volumes</FormLabel>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="Select a volume name" />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														{mountsByService?.map((volume) => (
															<SelectItem
																key={volume.Name}
																value={volume.Name || ""}
															>
																{volume.Name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<FormDescription>
													Choose the volume to backup, if you dont see the
													volume here, you can type the volume name manually
												</FormDescription>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
							</>
						)}
						{serviceTypeForm === "application" && (
							<FormField
								control={form.control}
								name="volumeName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Volumes</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value || ""}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select a volume name" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{mounts?.map((mount) => (
													<SelectItem key={mount.Name} value={mount.Name || ""}>
														{mount.Name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormDescription>
											Choose the volume to backup, if you dont see the volume
											here, you can type the volume name manually
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
										<Input placeholder="my-volume-name" {...field} />
									</FormControl>
									<FormDescription>
										The name of the Docker volume to backup
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

                                                <FormField
                                                        control={form.control}
                                                        name="prefix"
                                                        render={({ field }) => (
                                                                <FormItem>
                                                                        <FormLabel>Backup Prefix</FormLabel>
                                                                        <FormControl>
                                                                                <Input placeholder="backup-" {...field} />
                                                                        </FormControl>
                                                                        <FormDescription>
                                                                                Prefix for backup files (optional)
                                                                        </FormDescription>
                                                                        <FormMessage />
                                                                </FormItem>
                                                        )}
                                                />

                                                <FormField
                                                        control={form.control}
                                                        name="gpgKeyId"
                                                        render={({ field }) => (
                                                                <FormItem>
                                                                        <FormLabel>Backup encryption</FormLabel>
                                                                        <FormControl>
                                                                                <Select
                                                                                        value={
                                                                                                field.value && field.value.length > 0
                                                                                                        ? field.value
                                                                                                        : NO_GPG_KEY_VALUE
                                                                                        }
                                                                                        onValueChange={(value) => {
                                                                                                const normalizedValue =
                                                                                                        value === NO_GPG_KEY_VALUE ? "" : value;
                                                                                                field.onChange(normalizedValue);
                                                                                        }}
                                                                                >
                                                                                        <SelectTrigger
                                                                                                disabled={isLoadingGpgKeys}
                                                                                                className="w-full"
                                                                                        >
                                                                                                <SelectValue placeholder="Select encryption" />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent>
                                                                                                <SelectItem value={NO_GPG_KEY_VALUE}>
                                                                                                        No encryption
                                                                                                </SelectItem>
                                                                                                <SelectItem value="custom">
                                                                                                        Provide custom key
                                                                                                </SelectItem>
                                                                                                {gpgKeys?.map((gpgKey) => (
                                                                                                        <SelectItem
                                                                                                                key={gpgKey.gpgKeyId}
                                                                                                                value={gpgKey.gpgKeyId}
                                                                                                        >
                                                                                                                {gpgKey.name}
                                                                                                        </SelectItem>
                                                                                                ))}
                                                                                        </SelectContent>
                                                                                </Select>
                                                                        </FormControl>
                                                                        <FormDescription>
                                                                                Manage reusable keys from the Settings → Keys page.
                                                                        </FormDescription>
                                                                        {selectedManagedGpgKey && (
                                                                                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                                                                                        {selectedManagedGpgKey.description && (
                                                                                                <p>{selectedManagedGpgKey.description}</p>
                                                                                        )}
                                                                                        <div className="flex flex-wrap gap-2">
                                                                                                <Badge
                                                                                                        variant={
                                                                                                                selectedManagedGpgKey.privateKey
                                                                                                                        ? "default"
                                                                                                                        : "outline"
                                                                                                        }
                                                                                                >
                                                                                                        {selectedManagedGpgKey.privateKey
                                                                                                                ? "Secret stored"
                                                                                                                : "Secret not stored"}
                                                                                                </Badge>
                                                                                                <Badge
                                                                                                        variant={
                                                                                                                selectedManagedGpgKey.passphrase
                                                                                                                        ? "default"
                                                                                                                        : "outline"
                                                                                                        }
                                                                                                >
                                                                                                        {selectedManagedGpgKey.passphrase
                                                                                                                ? "Passphrase stored"
                                                                                                                : "No passphrase"}
                                                                                                </Badge>
                                                                                        </div>
                                                                                </div>
                                                                        )}
                                                                        <FormMessage />
                                                                </FormItem>
                                                        )}
                                                />

                                                {selectedGpgKeyId === "custom" && (
                                                        <FormField
                                                                control={form.control}
                                                                name="gpgPublicKey"
                                                                render={({ field }) => (
                                                                        <FormItem>
                                                                                <FormLabel>Custom GPG Public Key</FormLabel>
                                                                                <FormControl>
                                                                                        <Textarea
                                                                                                placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
                                                                                                className="min-h-[150px]"
                                                                                                {...field}
                                                                                        />
                                                                                </FormControl>
                                                                                <FormDescription>
                                                                                        Backups will be encrypted with this key before uploading.
                                                                                </FormDescription>
                                                                                <FormMessage />
                                                                        </FormItem>
                                                                )}
                                                        />
                                                )}

                                                <FormField
                                                        control={form.control}
                                                        name="keepLatestCount"
                                                        render={({ field }) => (
                                                                <FormItem>
									<FormLabel>Keep Latest Backups</FormLabel>
									<FormControl>
										<Input
											{...field}
											type="number"
											min={1}
											autoComplete="off"
											placeholder="Leave empty to keep all"
											value={keepLatestCountInput}
											onChange={(e) => {
												const raw = e.target.value;
												setKeepLatestCountInput(raw);
												if (raw === "") {
													field.onChange(undefined);
												} else if (/^\d+$/.test(raw)) {
													field.onChange(Number(raw));
												}
											}}
										/>
									</FormControl>
									<FormDescription>
										How many recent backups to keep. Empty means no cleanup.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="turnOff"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
										Turn Off Container During Backup
									</FormLabel>
									<FormDescription className="text-amber-600 dark:text-amber-400">
										⚠️ The container will be temporarily stopped during backup to
										prevent file corruption. This ensures data integrity but may
										cause temporary service interruption.
									</FormDescription>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="enabled"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="flex items-center gap-2">
										<Switch
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
										Enabled
									</FormLabel>
								</FormItem>
							)}
						/>

						<Button type="submit" isLoading={isLoading} className="w-full">
							{volumeBackupId ? "Update" : "Create"} Volume Backup
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
