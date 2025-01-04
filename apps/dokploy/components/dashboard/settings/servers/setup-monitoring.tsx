import { api } from "@/utils/api";
import { useRouter } from "next/router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, NumberInput } from "@/components/ui/input";
import { CardTitle } from "@/components/ui/card";
import { AlertTriangle, BarChart, BarcodeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { extractServices } from "@/pages/dashboard/project/[projectId]";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

interface Props {
	serverId: string;
}

const Schema = z.object({
	serverRefreshRateMetrics: z.number().min(2, {
		message: "Server Refresh Rate is required",
	}),
	containerRefreshRateMetrics: z.number().min(2, {
		message: "Container Refresh Rate is required",
	}),
	port: z.number({
		required_error: "Port is required",
	}),
	includeServices: z
		.array(
			z.object({
				appName: z.string(),
				maxFileSizeMB: z.number().min(1),
			}),
		)
		.optional(),
	excludedServices: z.string().array(),
});

type Schema = z.infer<typeof Schema>;

export const SetupMonitoring = ({ serverId }: Props) => {
	const { data, isLoading } = api.server.one.useQuery({
		serverId,
	});

	const { data: projects } = api.project.all.useQuery();

	const extractServicesFromProjects = (projects: any[] | undefined) => {
		if (!projects) return [];

		const allServices = projects.flatMap((project) => {
			const services = extractServices(project);
			return services
				.filter((service) => service.serverId === serverId)
				.map((service) => service.appName);
		});

		// Remove duplicates
		return [...new Set(allServices)];
	};

	const services = extractServicesFromProjects(projects);

	const form = useForm<Schema>({
		defaultValues: {
			port: 4500,
			serverRefreshRateMetrics: 10,
			containerRefreshRateMetrics: 10,
			excludedServices: [],
			includeServices: [],
		},
		resolver: zodResolver(Schema),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				port: data.defaultPortMetrics,
				serverRefreshRateMetrics: data.serverRefreshRateMetrics,
				containerRefreshRateMetrics: data.containerRefreshRateMetrics,
				excludedServices:
					data?.containersMetricsDefinition?.excludedServices ?? [],
				includeServices:
					data?.containersMetricsDefinition?.includeServices ?? [],
			});
		}
	}, [data]);

	const [search, setSearch] = useState("");
	const [searchExclude, setSearchExclude] = useState("");
	const [maxFileSize, setMaxFileSize] = useState(10);

	// Filtrar servicios ya incluidos
	const availableServices = services?.filter(
		(service) =>
			!form.watch("includeServices")?.some((s) => s.appName === service) &&
			!form.watch("excludedServices")?.includes(service) &&
			service.toLowerCase().includes(search.toLowerCase()),
	);

	// Filtrar servicios ya excluidos y servicios incluidos
	const availableServicesToExclude = [
		...(services?.filter(
			(service) =>
				!form.watch("excludedServices")?.includes(service) &&
				!form.watch("includeServices")?.some((s) => s.appName === service) &&
				service.toLowerCase().includes(searchExclude.toLowerCase()),
		) ?? []),
		// Siempre mostrar "*" si no está ya seleccionado
		...(!form.watch("excludedServices")?.includes("*") ? ["*"] : []),
	];

	const { mutateAsync } = api.server.setupMonitoring.useMutation();

	const onSubmit = async (values: Schema) => {
		await mutateAsync({
			serverId,
			...values,
			containerRefreshRateMetrics: values.containerRefreshRateMetrics,
			serverRefreshRateMetrics: values.serverRefreshRateMetrics,
			defaultPortMetrics: values.port,
			containersMetricsDefinition: {
				includeServices: values.includeServices ?? [],
				excludedServices: values.excludedServices,
			},
		})
			.then(() => {
				toast.success("Server updated successfully");
			})
			.catch(() => {
				toast.error("Error updating the server");
			});
	};

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex w-full flex-col gap-4"
			>
				<div className="flex flex-col gap-4">
					<FormField
						control={form.control}
						name="serverRefreshRateMetrics"
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
						name="containerRefreshRateMetrics"
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
						name="includeServices"
						render={({ field }) => (
							<FormItem className="flex flex-col">
								<FormLabel>Included Services</FormLabel>
								<FormControl>
									<div className="flex flex-col gap-2">
										<div className="flex flex-wrap gap-2">
											{field.value?.map((service, index) => (
												<Badge
													key={service.appName}
													variant="secondary"
													className="flex items-center gap-2"
												>
													{service.appName} ({service.maxFileSizeMB}MB)
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className="h-4 w-4 p-0"
														onClick={() => {
															const newValue = [...(field.value ?? [])];
															newValue.splice(index, 1);
															field.onChange(newValue);
														}}
													>
														×
													</Button>
												</Badge>
											))}
										</div>
										<div className="flex gap-2">
											<Popover>
												<PopoverTrigger asChild>
													<Button variant="outline" className="justify-between">
														Select service...
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[300px] p-0" align="start">
													<Command>
														<CommandInput
															placeholder="Search service..."
															value={search}
															onValueChange={setSearch}
														/>
														<CommandEmpty>No service found.</CommandEmpty>
														<CommandGroup className="max-h-[200px] overflow-hidden">
															<ScrollArea
																className="h-[200px]"
																onWheel={(e) => e.stopPropagation()}
															>
																{availableServices?.map((service) => (
																	<CommandItem
																		key={service}
																		value={service}
																		onSelect={() => {
																			field.onChange([
																				...(field.value ?? []),
																				{
																					appName: service,
																					maxFileSizeMB: maxFileSize,
																				},
																			]);
																			setSearch("");
																		}}
																	>
																		{service}
																	</CommandItem>
																))}
															</ScrollArea>
														</CommandGroup>
													</Command>
												</PopoverContent>
											</Popover>
											<NumberInput
												placeholder="Max size (MB)"
												value={maxFileSize}
												onChange={(e) => setMaxFileSize(Number(e.target.value))}
											/>
										</div>
									</div>
								</FormControl>
								<FormDescription>
									Services to monitor. Each service can have its own max file
									size for logs.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="excludedServices"
						render={({ field }) => (
							<FormItem className="flex flex-col">
								<FormLabel>Excluded Services</FormLabel>
								<FormControl>
									<div className="flex flex-col gap-2">
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
														size="sm"
														className="h-4 w-4 p-0"
														onClick={() => {
															const newValue = [...field.value];
															newValue.splice(index, 1);
															field.onChange(newValue);
														}}
													>
														×
													</Button>
												</Badge>
											))}
										</div>
										<div className="flex gap-2">
											<Popover>
												<PopoverTrigger asChild>
													<Button variant="outline" className="justify-between">
														Select service to exclude...
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[300px] p-0" align="start">
													<Command>
														<CommandInput
															placeholder="Search service..."
															value={searchExclude}
															onValueChange={setSearchExclude}
														/>
														<CommandEmpty>No service found.</CommandEmpty>
														<CommandGroup className="max-h-[200px] overflow-hidden">
															<ScrollArea
																className="h-[200px]"
																onWheel={(e) => e.stopPropagation()}
															>
																{availableServicesToExclude.map((service) => (
																	<CommandItem
																		key={service}
																		value={service}
																		onSelect={() => {
																			// Si selecciona "*", limpiar otros servicios excluidos
																			if (service === "*") {
																				field.onChange(["*"]);
																			} else {
																				// Si ya existe "*", quitarlo al seleccionar un servicio específico
																				const currentValue =
																					field.value?.filter(
																						(s) => s !== "*",
																					) || [];
																				field.onChange([
																					...currentValue,
																					service,
																				]);
																			}
																			setSearchExclude("");
																		}}
																	>
																		{service}
																	</CommandItem>
																))}
															</ScrollArea>
														</CommandGroup>
													</Command>
												</PopoverContent>
											</Popover>
										</div>
									</div>
								</FormControl>
								<FormDescription>
									Services to exclude from monitoring. Use "*" to exclude all
									services.
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="port"
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
				</div>
				<Button type="submit" isLoading={form.formState.isSubmitting}>
					Save changes
				</Button>
			</form>
		</Form>
	);
};