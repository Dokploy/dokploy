import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
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
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input, NumberInput } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { extractServices } from "@/pages/dashboard/project/[projectId]";
import { api } from "@/utils/api";
import { useUrl } from "@/utils/hooks/use-url";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LayoutDashboardIcon, RefreshCw } from "lucide-react";
import { type TFunction, useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface Props {
	serverId?: string;
}

const Schema = (t: TFunction) =>
	z.object({
		metricsConfig: z.object({
			server: z.object({
				refreshRate: z.number().min(2, {
					message: t("settings.monitoring.serverRefreshRateRequired"),
				}),
				port: z.number().min(1, {
					message: t("settings.monitoring.portRequired"),
				}),
				token: z.string(),
				urlCallback: z.string(),
				retentionDays: z.number().min(1, {
					message: t("settings.monitoring.retentionDaysMin"),
				}),
				thresholds: z.object({
					cpu: z.number().min(0),
					memory: z.number().min(0),
				}),
				cronJob: z.string().min(1, {
					message: t("settings.monitoring.cronJobRequired"),
				}),
			}),
			containers: z.object({
				refreshRate: z.number().min(2, {
					message: t("settings.monitoring.containerRefreshRateRequired"),
				}),
				services: z.object({
					include: z.array(z.string()).optional(),
					exclude: z.array(z.string()).optional(),
				}),
			}),
		}),
	});

type Schema = ReturnType<typeof Schema>["_type"];

export const SetupMonitoring = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");
	const { data } = serverId
		? api.server.one.useQuery(
				{
					serverId: serverId || "",
				},
				{
					enabled: !!serverId,
				},
			)
		: api.user.getServerMetrics.useQuery();

	const url = useUrl();

	const { data: projects } = api.project.all.useQuery();

	const extractServicesFromProjects = (projects: any[] | undefined) => {
		if (!projects) return [];

		const allServices = projects.flatMap((project) => {
			const services = extractServices(project);
			return serverId
				? services
						.filter((service) => service.serverId === serverId)
						.map((service) => service.appName)
				: services.map((service) => service.appName);
		});

		return [...new Set(allServices)];
	};

	const services = extractServicesFromProjects(projects);

	const form = useForm<Schema>({
		resolver: zodResolver(Schema(t)),
		defaultValues: {
			metricsConfig: {
				server: {
					refreshRate: 20,
					port: 4500,
					token: "",
					urlCallback: `${url}/api/trpc/notification.receiveNotification`,
					retentionDays: 7,
					thresholds: {
						cpu: 0,
						memory: 0,
					},
					cronJob: "",
				},
				containers: {
					refreshRate: 20,
					services: {
						include: [],
						exclude: [],
					},
				},
			},
		},
	});

	useEffect(() => {
		if (data) {
			form.reset({
				metricsConfig: {
					server: {
						refreshRate: data?.metricsConfig?.server?.refreshRate,
						port: data?.metricsConfig?.server?.port,
						token: data?.metricsConfig?.server?.token || generateToken(),
						urlCallback:
							data?.metricsConfig?.server?.urlCallback ||
							`${url}/api/trpc/notification.receiveNotification`,
						retentionDays: data?.metricsConfig?.server?.retentionDays || 5,
						thresholds: {
							cpu: data?.metricsConfig?.server?.thresholds?.cpu,
							memory: data?.metricsConfig?.server?.thresholds?.memory,
						},
						cronJob: data?.metricsConfig?.server?.cronJob || "0 0 * * *",
					},
					containers: {
						refreshRate: data?.metricsConfig?.containers?.refreshRate,
						services: {
							include: data?.metricsConfig?.containers?.services?.include,
							exclude: data?.metricsConfig?.containers?.services?.exclude,
						},
					},
				},
			});
		}
	}, [data, url]);

	const [search, setSearch] = useState("");
	const [searchExclude, setSearchExclude] = useState("");
	const [showToken, setShowToken] = useState(false);

	const availableServices = services?.filter(
		(service) =>
			!form
				.watch("metricsConfig.containers.services.include")
				?.some((s) => s === service) &&
			!form
				.watch("metricsConfig.containers.services.exclude")
				?.includes(service) &&
			service.toLowerCase().includes(search.toLowerCase()),
	);

	const availableServicesToExclude = [
		...(services?.filter(
			(service) =>
				!form
					.watch("metricsConfig.containers.services.exclude")
					?.includes(service) &&
				!form
					.watch("metricsConfig.containers.services.include")
					?.some((s) => s === service) &&
				service.toLowerCase().includes(searchExclude.toLowerCase()),
		) ?? []),
		...(!form.watch("metricsConfig.containers.services.exclude")?.includes("*")
			? ["*"]
			: []),
	];

	const { mutateAsync } = serverId
		? api.server.setupMonitoring.useMutation()
		: api.admin.setupMonitoring.useMutation();

	const generateToken = () => {
		const array = new Uint8Array(64);
		crypto.getRandomValues(array);
		return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
			"",
		);
	};

	const onSubmit = async (values: Schema) => {
		await mutateAsync({
			serverId: serverId || "",
			metricsConfig: values.metricsConfig,
		})
			.then(() => {
				toast.success(t("settings.monitoring.serverUpdatedSuccessfully"));
			})
			.catch(() => {
				toast.error(t("settings.monitoring.errorUpdatingServer"));
			});
	};

	return (
		<>
			<CardHeader className="">
				<CardTitle className="text-xl flex flex-row gap-2">
					<LayoutDashboardIcon className="size-6 text-muted-foreground self-center" />
					{t("settings.monitoring.title")}
				</CardTitle>
				<CardDescription>
					{t("settings.monitoring.description")}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6 py-6 border-t">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="flex w-full flex-col gap-4"
					>
						<AlertBlock>{t("settings.monitoring.alertBlock")}</AlertBlock>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="metricsConfig.server.refreshRate"
								render={({ field }) => (
									<FormItem className="flex flex-col justify-center max-sm:items-center">
										<FormLabel>
											{t("settings.monitoring.serverRefreshRate")}
										</FormLabel>
										<FormControl>
											<NumberInput
												placeholder={t(
													"settings.monitoring.serverRefreshRatePlaceholder",
												)}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.monitoring.serverRefreshRateDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="metricsConfig.containers.refreshRate"
								render={({ field }) => (
									<FormItem className="flex flex-col justify-center max-sm:items-center">
										<FormLabel>
											{t("settings.monitoring.containerRefreshRate")}
										</FormLabel>
										<FormControl>
											<NumberInput
												placeholder={t(
													"settings.monitoring.containerRefreshRatePlaceholder",
												)}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.monitoring.containerRefreshRateDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="metricsConfig.server.cronJob"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.monitoring.cronJob")}</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder={t(
													"settings.monitoring.cronJobPlaceholder",
												)}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.monitoring.cronJobDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="metricsConfig.server.retentionDays"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.monitoring.serverRetentionDays")}
										</FormLabel>
										<FormControl>
											<NumberInput {...field} />
										</FormControl>
										<FormDescription>
											{t("settings.monitoring.serverRetentionDaysDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="metricsConfig.server.port"
								render={({ field }) => (
									<FormItem className="flex flex-col justify-center max-sm:items-center">
										<FormLabel>{t("settings.monitoring.port")}</FormLabel>
										<FormControl>
											<NumberInput placeholder="4500" {...field} />
										</FormControl>
										<FormDescription>
											{t("settings.monitoring.portDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="metricsConfig.containers.services.include"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.monitoring.includeServices")}
										</FormLabel>
										<FormControl>
											<div className="flex flex-col gap-4">
												<div className="flex gap-2">
													<Popover>
														<PopoverTrigger asChild>
															<Button variant="outline">
																{t("settings.monitoring.addService")}
															</Button>
														</PopoverTrigger>
														<PopoverContent
															className="w-[300px] p-0"
															align="start"
														>
															<Command>
																<CommandInput
																	placeholder={t(
																		"settings.monitoring.searchService",
																	)}
																	value={search}
																	onValueChange={setSearch}
																/>
																{availableServices?.length === 0 ? (
																	<div className="p-4 text-sm text-muted-foreground">
																		{t(
																			"settings.monitoring.noServicesAvailable",
																		)}
																	</div>
																) : (
																	<>
																		<CommandEmpty>
																			{t("settings.monitoring.noServiceFound")}
																		</CommandEmpty>
																		<CommandGroup>
																			{availableServices?.map((service) => (
																				<CommandItem
																					key={service}
																					value={service}
																					onSelect={() => {
																						field.onChange([
																							...(field.value ?? []),
																							service,
																						]);
																						setSearch("");
																					}}
																				>
																					{service}
																				</CommandItem>
																			))}
																		</CommandGroup>
																	</>
																)}
															</Command>
														</PopoverContent>
													</Popover>
												</div>
												<div className="flex flex-wrap gap-2">
													{field.value?.map((service) => (
														<Badge
															key={service}
															variant="secondary"
															className="flex items-center gap-2"
														>
															{service}
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="h-4 w-4 p-0"
																onClick={() => {
																	field.onChange(
																		field.value?.filter((s) => s !== service),
																	);
																}}
															>
																×
															</Button>
														</Badge>
													))}
													<FormDescription>
														{t("settings.monitoring.servicesToMonitor")}
													</FormDescription>
												</div>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="metricsConfig.containers.services.exclude"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.monitoring.excludeServices")}
										</FormLabel>
										<FormControl>
											<div className="flex flex-col gap-4">
												<div className="flex gap-2">
													<Popover>
														<PopoverTrigger asChild>
															<Button variant="outline">
																{t("settings.monitoring.addService")}
															</Button>
														</PopoverTrigger>
														<PopoverContent
															className="w-[300px] p-0"
															align="start"
														>
															<Command>
																<CommandInput
																	placeholder={t(
																		"settings.monitoring.searchService",
																	)}
																	value={searchExclude}
																	onValueChange={setSearchExclude}
																/>
																{availableServicesToExclude?.length === 0 ? (
																	<div className="p-4 text-sm text-muted-foreground">
																		{t(
																			"settings.monitoring.noServicesAvailable",
																		)}
																	</div>
																) : (
																	<>
																		<CommandEmpty>
																			{t("settings.monitoring.noServiceFound")}
																		</CommandEmpty>
																		<CommandGroup>
																			{availableServicesToExclude.map(
																				(service) => (
																					<CommandItem
																						key={service}
																						value={service}
																						onSelect={() => {
																							field.onChange([
																								...(field.value ?? []),
																								service,
																							]);
																							setSearchExclude("");
																						}}
																					>
																						{service}
																					</CommandItem>
																				),
																			)}
																		</CommandGroup>
																	</>
																)}
															</Command>
														</PopoverContent>
													</Popover>
												</div>
												<div className="flex flex-wrap gap-2">
													{field.value?.map((service, index) => (
														<Badge
															key={service}
															variant="secondary"
															className="flex items-center gap-2"
														>
															{service}
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="h-4 w-4 p-0"
																onClick={() => {
																	field.onChange(
																		field.value?.filter((_, i) => i !== index),
																	);
																}}
															>
																×
															</Button>
														</Badge>
													))}
													<FormDescription>
														{t("settings.monitoring.servicesToExclude")}
													</FormDescription>
												</div>
											</div>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="metricsConfig.server.thresholds.cpu"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.monitoring.cpuThreshold")}
										</FormLabel>
										<FormControl>
											<NumberInput {...field} />
										</FormControl>
										<FormDescription>
											{t("settings.monitoring.cpuThresholdDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="metricsConfig.server.thresholds.memory"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.monitoring.memoryThreshold")}
										</FormLabel>
										<FormControl>
											<NumberInput {...field} />
										</FormControl>
										<FormDescription>
											{t("settings.monitoring.memoryThresholdDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="metricsConfig.server.token"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.monitoring.metricsToken")}
										</FormLabel>
										<FormControl>
											<div className="flex gap-2">
												<div className="relative flex-1">
													<Input
														type={showToken ? "text" : "password"}
														placeholder={t(
															"settings.monitoring.metricsTokenPlaceholder",
														)}
														{...field}
													/>
													<Button
														type="button"
														variant="secondary"
														size="icon"
														className="absolute right-0 top-1/2 -translate-y-1/2"
														onClick={() => setShowToken(!showToken)}
														title={
															showToken
																? t("settings.monitoring.hideToken")
																: t("settings.monitoring.showToken")
														}
													>
														{showToken ? (
															<EyeOff className="h-4 w-4" />
														) : (
															<Eye className="h-4 w-4" />
														)}
													</Button>
												</div>
												<Button
													type="button"
													variant="outline"
													size="icon"
													onClick={() => {
														const newToken = generateToken();
														form.setValue(
															"metricsConfig.server.token",
															newToken,
														);
														toast.success(
															t(
																"settings.monitoring.tokenGeneratedSuccessfully",
															),
														);
													}}
													title={t("settings.monitoring.generateNewToken")}
												>
													<RefreshCw className="h-4 w-4" />
												</Button>
											</div>
										</FormControl>
										<FormDescription>
											{t("settings.monitoring.metricsTokenDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="metricsConfig.server.urlCallback"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("settings.monitoring.metricsCallbackUrl")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.monitoring.metricsCallbackUrlPlaceholder",
												)}
												{...field}
											/>
										</FormControl>
										<FormDescription>
											{t("settings.monitoring.metricsCallbackUrlDescription")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex items-center justify-end gap-2">
							<Button type="submit" isLoading={form.formState.isSubmitting}>
								{t("settings.monitoring.saveChanges")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</>
	);
};
