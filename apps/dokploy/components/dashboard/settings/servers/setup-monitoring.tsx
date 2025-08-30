import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LayoutDashboardIcon, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

interface Props {
	serverId?: string;
}

const Schema = z.object({
	metricsConfig: z.object({
		server: z.object({
			refreshRate: z.number().min(2, {
				message: "Server Refresh Rate is required",
			}),
			port: z.number().min(1, {
				message: "Port is required",
			}),
			token: z.string(),
			urlCallback: z.string(),
			retentionDays: z.number().min(1, {
				message: "Retention days must be at least 1",
			}),
			thresholds: z.object({
				cpu: z.number().min(0),
				memory: z.number().min(0),
			}),
			cronJob: z.string().min(1, {
				message: "Cron Job is required",
			}),
		}),
		containers: z.object({
			refreshRate: z.number().min(2, {
				message: "Container Refresh Rate is required",
			}),
			services: z.object({
				include: z.array(z.string()).optional(),
				exclude: z.array(z.string()).optional(),
			}),
		}),
	}),
});

type Schema = z.infer<typeof Schema>;

export const SetupMonitoring = ({ serverId }: Props) => {
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
		resolver: zodResolver(Schema),
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
				toast.success("Server updated successfully");
			})
			.catch(() => {
				toast.error("Error updating the server");
			});
	};

	return (
		<>
			<CardHeader className="">
				<CardTitle className="text-xl flex flex-row gap-2">
					<LayoutDashboardIcon className="size-6 text-muted-foreground self-center" />
					Monitoring
				</CardTitle>
				<CardDescription>
					Monitor your servers and containers in realtime with notifications
					when they reach their thresholds.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6 py-6 border-t">
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="flex w-full flex-col gap-4"
					>
						<AlertBlock>
							Using a lower refresh rate will make your CPU and memory usage
							higher, we recommend 30-60 seconds
						</AlertBlock>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="metricsConfig.server.refreshRate"
								render={({ field }) => (
									<FormItem className="flex flex-col justify-center max-sm:items-center">
										<FormLabel>Server Refresh Rate</FormLabel>
										<FormControl>
											<NumberInput placeholder="10" {...field} />
										</FormControl>
										<FormDescription>
											Please set the refresh rate for the server in seconds
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
										<FormLabel>Container Refresh Rate</FormLabel>
										<FormControl>
											<NumberInput placeholder="10" {...field} />
										</FormControl>
										<FormDescription>
											Please set the refresh rate for the containers in seconds
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
										<FormLabel>Cron Job</FormLabel>
										<FormControl>
											<Input {...field} placeholder="0 0 * * *" />
										</FormControl>
										<FormDescription>
											Cron job for cleaning up metrics
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
										<FormLabel>Server Retention Days</FormLabel>
										<FormControl>
											<NumberInput {...field} />
										</FormControl>
										<FormDescription>
											Number of days to retain server metrics data
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
										<FormLabel>Port</FormLabel>
										<FormControl>
											<NumberInput placeholder="4500" {...field} />
										</FormControl>
										<FormDescription>
											Please set the port for the metrics server
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
										<FormLabel>Include Services</FormLabel>
										<FormControl>
											<div className="flex flex-col gap-4">
												<div className="flex gap-2">
													<Popover>
														<PopoverTrigger asChild>
															<Button variant="outline">Add Service</Button>
														</PopoverTrigger>
														<PopoverContent
															className="w-[300px] p-0"
															align="start"
														>
															<Command>
																<CommandInput
																	placeholder="Search service..."
																	value={search}
																	onValueChange={setSearch}
																/>
																{availableServices?.length === 0 ? (
																	<div className="p-4 text-sm text-muted-foreground">
																		No services available.
																	</div>
																) : (
																	<>
																		<CommandEmpty>
																			No service found.
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
														Services to monitor.
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
										<FormLabel>Exclude Services</FormLabel>
										<FormControl>
											<div className="flex flex-col gap-4">
												<div className="flex gap-2">
													<Popover>
														<PopoverTrigger asChild>
															<Button variant="outline">Add Service</Button>
														</PopoverTrigger>
														<PopoverContent
															className="w-[300px] p-0"
															align="start"
														>
															<Command>
																<CommandInput
																	placeholder="Search service..."
																	value={searchExclude}
																	onValueChange={setSearchExclude}
																/>
																{availableServicesToExclude?.length === 0 ? (
																	<div className="p-4 text-sm text-muted-foreground">
																		No services available.
																	</div>
																) : (
																	<>
																		<CommandEmpty>
																			No service found.
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
														Services to exclude from monitoring
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
										<FormLabel>CPU Threshold (%)</FormLabel>
										<FormControl>
											<NumberInput {...field} />
										</FormControl>
										<FormDescription>
											Alert when CPU usage exceeds this percentage
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
										<FormLabel>Memory Threshold (%)</FormLabel>
										<FormControl>
											<NumberInput {...field} />
										</FormControl>
										<FormDescription>
											Alert when memory usage exceeds this percentage
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
										<FormLabel>Metrics Token</FormLabel>
										<FormControl>
											<div className="flex gap-2">
												<div className="relative flex-1">
													<Input
														type={showToken ? "text" : "password"}
														placeholder="Enter your metrics token"
														{...field}
													/>
													<Button
														type="button"
														variant="secondary"
														size="icon"
														className="absolute right-0 top-1/2 -translate-y-1/2"
														onClick={() => setShowToken(!showToken)}
														title={showToken ? "Hide token" : "Show token"}
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
														toast.success("Token generated successfully");
													}}
													title="Generate new token"
												>
													<RefreshCw className="h-4 w-4" />
												</Button>
											</div>
										</FormControl>
										<FormDescription>
											Token for authenticating metrics requests
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
										<FormLabel>Metrics Callback URL</FormLabel>
										<FormControl>
											<Input
												placeholder="https://your-callback-url.com"
												{...field}
											/>
										</FormControl>
										<FormDescription>
											URL where metrics will be sent
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="flex items-center justify-end gap-2">
							<Button type="submit" isLoading={form.formState.isSubmitting}>
								Save changes
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</>
	);
};
