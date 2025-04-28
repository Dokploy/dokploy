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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	CheckIcon,
	ChevronsUpDown,
	DatabaseZap,
	PenBoxIcon,
	RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

type CacheType = "cache" | "fetch";

const getMetadataSchema = (
	backupType: "database" | "compose",
	databaseType: DatabaseType,
) => {
	if (backupType !== "compose") return z.object({}).optional();

	const schemas = {
		postgres: z.object({
			databaseUser: z.string().min(1, "Database user is required"),
		}),
		mariadb: z.object({
			databaseUser: z.string().min(1, "Database user is required"),
			databasePassword: z.string().min(1, "Database password is required"),
		}),
		mongo: z.object({
			databaseUser: z.string().min(1, "Database user is required"),
			databasePassword: z.string().min(1, "Database password is required"),
		}),
		mysql: z.object({
			databaseRootPassword: z.string().min(1, "Root password is required"),
		}),
		"web-server": z.object({}),
	};

	return z.object({
		[databaseType]: schemas[databaseType as keyof typeof schemas],
	});
};

const Schema = z.object({
	destinationId: z.string().min(1, "Destination required"),
	schedule: z.string().min(1, "Schedule (Cron) required"),
	prefix: z.string().min(1, "Prefix required"),
	enabled: z.boolean(),
	database: z.string().min(1, "Database required"),
	keepLatestCount: z.coerce.number().optional(),
	serviceName: z.string().nullable(),
	metadata: z.object({}).optional(),
});

interface Props {
	backupId: string;
	refetch: () => void;
}

type DatabaseType = "postgres" | "mariadb" | "mysql" | "mongo" | "web-server";

export const UpdateBackup = ({ backupId, refetch }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [cacheType, setCacheType] = useState<CacheType>("cache");

	const { data, isLoading } = api.destination.all.useQuery();
	const { data: backup } = api.backup.one.useQuery(
		{
			backupId,
		},
		{
			enabled: !!backupId,
		},
	);
	const [selectedDatabaseType, setSelectedDatabaseType] =
		useState<DatabaseType>(
			(backup?.databaseType as DatabaseType) || "postgres",
		);
	const {
		data: services,
		isFetching: isLoadingServices,
		error: errorServices,
		refetch: refetchServices,
	} = api.compose.loadServices.useQuery(
		{
			composeId: backup?.composeId || "",
			type: cacheType,
		},
		{
			retry: false,
			refetchOnWindowFocus: false,
			enabled:
				isOpen && backup?.backupType === "compose" && !!backup?.composeId,
		},
	);

	const { mutateAsync, isLoading: isLoadingUpdate } =
		api.backup.update.useMutation();

	const schema = Schema.extend({
		metadata: getMetadataSchema(
			backup?.backupType || "database",
			selectedDatabaseType,
		),
	});

	const form = useForm<z.infer<typeof schema>>({
		defaultValues: {
			database: "",
			destinationId: "",
			enabled: true,
			prefix: "/",
			schedule: "",
			keepLatestCount: undefined,
			serviceName: null,
			metadata: {},
		},
		resolver: zodResolver(schema),
	});

	useEffect(() => {
		if (backup) {
			form.reset({
				database: backup.database,
				destinationId: backup.destinationId,
				enabled: backup.enabled || false,
				prefix: backup.prefix,
				schedule: backup.schedule,
				serviceName: backup.serviceName || null,
				keepLatestCount: backup.keepLatestCount
					? Number(backup.keepLatestCount)
					: undefined,
				metadata: backup.metadata || {},
			});
		}
	}, [form, form.reset, backup]);

	useEffect(() => {
		if (backup?.backupType === "compose") {
			const currentValues = form.getValues();
			form.reset(
				{
					...currentValues,
				},
				{ keepDefaultValues: true },
			);
		}
	}, [selectedDatabaseType, backup?.backupType, form]);

	const onSubmit = async (data: z.infer<typeof schema>) => {
		if (backup?.backupType === "compose" && !data.serviceName) {
			form.setError("serviceName", {
				type: "manual",
				message: "Service name is required for compose backups",
			});
			return;
		}

		await mutateAsync({
			backupId,
			destinationId: data.destinationId,
			prefix: data.prefix,
			schedule: data.schedule,
			enabled: data.enabled,
			database: data.database,
			serviceName: data.serviceName,
			keepLatestCount: data.keepLatestCount as number | null,
			metadata: data.metadata || {},
			databaseType:
				backup?.backupType === "compose"
					? selectedDatabaseType
					: (backup?.databaseType as DatabaseType),
		})
			.then(async () => {
				toast.success("Backup Updated");
				refetch();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error updating the Backup");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-blue-500/10"
				>
					<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Update Backup</DialogTitle>
					<DialogDescription>Update the backup</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						id="hook-form-update-backup"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="grid grid-cols-1 gap-4">
							{errorServices && (
								<AlertBlock type="warning" className="[overflow-wrap:anywhere]">
									{errorServices?.message}
								</AlertBlock>
							)}
							{backup?.backupType === "compose" && (
								<FormItem>
									<FormLabel>Database Type</FormLabel>
									<Select
										value={selectedDatabaseType}
										onValueChange={(value) => {
											setSelectedDatabaseType(value as DatabaseType);
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select a database type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="postgres">PostgreSQL</SelectItem>
											<SelectItem value="mariadb">MariaDB</SelectItem>
											<SelectItem value="mysql">MySQL</SelectItem>
											<SelectItem value="mongo">MongoDB</SelectItem>
										</SelectContent>
									</Select>
								</FormItem>
							)}
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
														{isLoading
															? "Loading...."
															: field.value
																? data?.find(
																		(destination) =>
																			destination.destinationId === field.value,
																	)?.name
																: "Select Destination"}

														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</FormControl>
											</PopoverTrigger>
											<PopoverContent className="p-0" align="start">
												<Command>
													<CommandInput
														placeholder="Search Destination..."
														className="h-9"
													/>
													{isLoading && (
														<span className="py-6 text-center text-sm">
															Loading Destinations....
														</span>
													)}
													<CommandEmpty>No destinations found.</CommandEmpty>
													<ScrollArea className="h-64">
														<CommandGroup>
															{data?.map((destination) => (
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
							{backup?.backupType === "compose" && (
								<div className="flex flex-row items-end w-full gap-4">
									<FormField
										control={form.control}
										name="serviceName"
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
							)}
							<FormField
								control={form.control}
								name="database"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Database</FormLabel>
											<FormControl>
												<Input placeholder={"dokploy"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="schedule"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Schedule (Cron)</FormLabel>
											<FormControl>
												<Input placeholder={"0 0 * * *"} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="prefix"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Prefix Destination</FormLabel>
											<FormControl>
												<Input placeholder={"dokploy/"} {...field} />
											</FormControl>
											<FormDescription>
												Use if you want to back up in a specific path of your
												destination/bucket
											</FormDescription>

											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="keepLatestCount"
								render={({ field }) => {
									return (
										<FormItem>
											<FormLabel>Keep the latest</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder={"keeps all the backups if left empty"}
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Optional. If provided, only keeps the latest N backups
												in the cloud.
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>
							<FormField
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 ">
										<div className="space-y-0.5">
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
							{backup?.backupType === "compose" && (
								<>
									{selectedDatabaseType === "postgres" && (
										<FormField
											control={form.control}
											name="metadata.postgres.databaseUser"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Database User</FormLabel>
													<FormControl>
														<Input placeholder="postgres" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									)}

									{selectedDatabaseType === "mariadb" && (
										<>
											<FormField
												control={form.control}
												name="metadata.mariadb.databaseUser"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Database User</FormLabel>
														<FormControl>
															<Input placeholder="mariadb" {...field} />
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
																placeholder="••••••••"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</>
									)}

									{selectedDatabaseType === "mongo" && (
										<>
											<FormField
												control={form.control}
												name="metadata.mongo.databaseUser"
												render={({ field }) => (
													<FormItem>
														<FormLabel>Database User</FormLabel>
														<FormControl>
															<Input placeholder="mongo" {...field} />
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
																placeholder="••••••••"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</>
									)}

									{selectedDatabaseType === "mysql" && (
										<FormField
											control={form.control}
											name="metadata.mysql.databaseRootPassword"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Root Password</FormLabel>
													<FormControl>
														<Input
															type="password"
															placeholder="••••••••"
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
						</div>
						<DialogFooter>
							<Button
								isLoading={isLoadingUpdate}
								form="hook-form-update-backup"
								type="submit"
							>
								Update
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
