import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { DatabaseZap, PenBoxIcon, PlusCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
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

const formSchema = z
	.object({
		name: z.string().min(1, "application.volumeBackups.nameRequired"),
		cronExpression: z.string().min(1, "application.schedules.cronRequired"),
		volumeName: z
			.string()
			.min(1, "application.volumeBackups.volumeNameRequired")
			.regex(
				/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
				"application.volumes.invalidVolumeName",
			),
		prefix: z.string(),
		keepLatestCount: z.coerce
			.number()
			.int()
			.gte(1, "application.volumeBackups.keepLatestMin")
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
			"libsql",
		]),
		serviceName: z.string(),
		destinationId: z
			.string()
			.min(1, "application.volumeBackups.destinationRequired"),
	})
	.superRefine((data, ctx) => {
		if (data.serviceType === "compose" && !data.serviceName) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "application.schedules.serviceNameRequired",
				path: ["serviceName"],
			});
		}

		if (data.serviceType === "compose" && !data.serviceName) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "application.schedules.serviceNameRequired",
				path: ["serviceName"],
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
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");
	const [keepLatestCountInput, setKeepLatestCountInput] = useState("");

	const utils = api.useUtils();
	const form = useForm({
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
		},
	});

	const serviceTypeForm = volumeBackupType;
	const { data: destinations } = api.destination.all.useQuery();
	const { data: volumeBackup } = api.volumeBackups.one.useQuery(
		{ volumeBackupId: volumeBackupId || "" },
		{ enabled: !!volumeBackupId },
	);

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
			});
			setKeepLatestCountInput(
				volumeBackup.keepLatestCount !== null &&
					volumeBackup.keepLatestCount !== undefined
					? String(volumeBackup.keepLatestCount)
					: "",
			);
		}
	}, [form, volumeBackup, volumeBackupId]);

	const { mutateAsync, isPending } = volumeBackupId
		? api.volumeBackups.update.useMutation()
		: api.volumeBackups.create.useMutation();

	const onSubmit = async (values: z.infer<typeof formSchema>) => {
		if (!id && !volumeBackupId) return;

		const preparedKeepLatestCount =
			keepLatestCountInput === "" ? null : (values.keepLatestCount ?? null);

		await mutateAsync({
			...values,
			keepLatestCount: preparedKeepLatestCount ?? undefined,
			destinationId: values.destinationId,
			volumeBackupId: volumeBackupId || "",
			serviceType: volumeBackupType,
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
					volumeBackupId
						? t("application.volumeBackups.updated")
						: t("application.volumeBackups.created"),
				);
				utils.volumeBackups.list.invalidate({
					id,
					volumeBackupType,
				});
				setIsOpen(false);
			})
			.catch((error) => {
				toast.error(
					error instanceof Error
						? error.message
						: t("application.volumeBackups.unknownError"),
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
						{t("application.volumeBackups.addBackup")}
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
						{volumeBackupId
							? t("application.volumeBackups.editTitle")
							: t("application.volumeBackups.createTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("application.volumeBackups.dialogDescription")}
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
										{t("application.schedules.taskName")}
									</FormLabel>
									<FormControl>
										<Input placeholder="Daily Database Backup" {...field} />
									</FormControl>
									<FormDescription>
										{t("application.schedules.taskNameDescription")}
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
									<FormLabel>
										{t("application.volumeBackups.destination")}
									</FormLabel>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue
													placeholder={t(
														"application.volumeBackups.selectDestination",
													)}
												/>
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
										{t("application.volumeBackups.destinationDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						{serviceTypeForm === "compose" && (
							<>
								<div className="flex flex-col w-full gap-4">
									{errorServices && (
										<AlertBlock type="warning" className="wrap-anywhere">
											{errorServices?.message}
										</AlertBlock>
									)}
									<FormField
										control={form.control}
										name="serviceName"
										render={({ field }) => (
											<FormItem className="w-full">
												<FormLabel>
													{t("application.schedules.serviceName")}
												</FormLabel>
												<div className="flex gap-2">
													<Select
														onValueChange={field.onChange}
														defaultValue={field.value || ""}
													>
														<FormControl>
															<SelectTrigger>
																<SelectValue
																	placeholder={t(
																		"application.schedules.selectServiceName",
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
															<SelectItem value="none" disabled>
																{t("application.schedules.empty")}
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
																className="max-w-40"
															>
																<p>{t("application.schedules.fetchTooltip")}</p>
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
																className="max-w-40"
															>
																<p>{t("application.schedules.cacheTooltip")}</p>
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
												<FormLabel>
													{t("application.volumeBackups.volumes")}
												</FormLabel>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue
																placeholder={t(
																	"application.volumeBackups.selectVolume",
																)}
															/>
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
													{t("application.volumeBackups.volumeDescription")}
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
										<FormLabel>
											{t("application.volumeBackups.volumes")}
										</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value || ""}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t(
															"application.volumeBackups.selectVolume",
														)}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{mounts && mounts.length > 0 ? (
													mounts.map((mount) => (
														<SelectItem
															key={mount.Name}
															value={mount.Name || ""}
														>
															{mount.Name}
														</SelectItem>
													))
												) : (
													<SelectItem value="none" disabled>
														{t("application.volumeBackups.noVolumesFound")}
													</SelectItem>
												)}
											</SelectContent>
										</Select>
										<FormDescription>
											{t("application.volumeBackups.volumeDescription")}
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
									<FormLabel>
										{t("application.volumeBackups.volumeName")}
									</FormLabel>
									<FormControl>
										<Input placeholder="my-volume-name" {...field} />
									</FormControl>
									<FormDescription>
										{t("application.volumeBackups.volumeNameDescription")}
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
									<FormLabel>
										{t("application.volumeBackups.backupPrefix")}
									</FormLabel>
									<FormControl>
										<Input placeholder="backup-" {...field} />
									</FormControl>
									<FormDescription>
										{t("application.volumeBackups.backupPrefixDescription")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="keepLatestCount"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("application.volumeBackups.keepLatest")}
									</FormLabel>
									<FormControl>
										<Input
											{...field}
											type="number"
											min={1}
											autoComplete="off"
											placeholder={t(
												"application.volumeBackups.keepLatestPlaceholder",
											)}
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
										{t("application.volumeBackups.keepLatestDescription")}
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
										{t("application.volumeBackups.turnOff")}
									</FormLabel>
									<FormDescription className="text-amber-600 dark:text-amber-400">
										⚠️ {t("application.volumeBackups.turnOffDescription")}
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
										{t("application.volumeBackups.enabled")}
									</FormLabel>
								</FormItem>
							)}
						/>

						<Button type="submit" isLoading={isPending} className="w-full">
							{volumeBackupId
								? t("application.volumeBackups.updateBackup")
								: t("application.volumeBackups.createBackup")}
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
