import type { ServiceType } from "@dokploy/server/db/schema";
import {
	Check,
	ChevronDown,
	ChevronRight,
	CircuitBoard,
	FolderInput,
	GlobeIcon,
	X,
} from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import {
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { api } from "@/utils/api";

interface AdvanceBreadcrumbProps {
	projectId?: string;
	environmentId?: string;
	serviceId?: string;
	serviceType?: ServiceType;
}

const getServiceIcon = (type: ServiceType, className = "size-4") => {
	const icons: Record<ServiceType, React.ReactNode> = {
		application: <GlobeIcon className={className} />,
		compose: <CircuitBoard className={className} />,
		postgres: <PostgresqlIcon className={className} />,
		mysql: <MysqlIcon className={className} />,
		mariadb: <MariadbIcon className={className} />,
		redis: <RedisIcon className={className} />,
		mongo: <MongodbIcon className={className} />,
	};

	return icons[type];
};

interface ServiceItem {
	id: string;
	name: string;
	type: ServiceType;
	appName?: string;
}

interface EnvironmentData {
	applications?: Array<{
		applicationId: string;
		name: string;
		appName: string;
	}>;
	compose?: Array<{ composeId: string; name: string; appName: string }>;
	postgres?: Array<{ postgresId: string; name: string; appName: string }>;
	mysql?: Array<{ mysqlId: string; name: string; appName: string }>;
	mariadb?: Array<{ mariadbId: string; name: string; appName: string }>;
	redis?: Array<{ redisId: string; name: string; appName: string }>;
	mongo?: Array<{ mongoId: string; name: string; appName: string }>;
}

// Helper function to count total services in an environment
const countEnvironmentServices = (env: EnvironmentData): number => {
	return (
		(env.applications?.length || 0) +
		(env.compose?.length || 0) +
		(env.postgres?.length || 0) +
		(env.mysql?.length || 0) +
		(env.mariadb?.length || 0) +
		(env.redis?.length || 0) +
		(env.mongo?.length || 0)
	);
};

// Helper function to extract services from an environment into a flat array
const extractServicesFromEnvironment = (
	env: EnvironmentData,
): ServiceItem[] => {
	const services: ServiceItem[] = [];

	env.applications?.forEach((app) => {
		services.push({
			id: app.applicationId,
			name: app.name,
			type: "application",
			appName: app.appName,
		});
	});

	env.compose?.forEach((comp) => {
		services.push({
			id: comp.composeId,
			name: comp.name,
			type: "compose",
			appName: comp.appName,
		});
	});

	env.postgres?.forEach((pg) => {
		services.push({
			id: pg.postgresId,
			name: pg.name,
			type: "postgres",
			appName: pg.appName,
		});
	});

	env.mysql?.forEach((my) => {
		services.push({
			id: my.mysqlId,
			name: my.name,
			type: "mysql",
			appName: my.appName,
		});
	});

	env.mariadb?.forEach((maria) => {
		services.push({
			id: maria.mariadbId,
			name: maria.name,
			type: "mariadb",
			appName: maria.appName,
		});
	});

	env.redis?.forEach((red) => {
		services.push({
			id: red.redisId,
			name: red.name,
			type: "redis",
			appName: red.appName,
		});
	});

	env.mongo?.forEach((mon) => {
		services.push({
			id: mon.mongoId,
			name: mon.name,
			type: "mongo",
			appName: mon.appName,
		});
	});

	return services;
};

export const AdvanceBreadcrumb = ({
	projectId,
	environmentId,
	serviceId,
}: AdvanceBreadcrumbProps) => {
	const router = useRouter();
	const [projectOpen, setProjectOpen] = useState(false);
	const [serviceOpen, setServiceOpen] = useState(false);
	const [environmentOpen, setEnvironmentOpen] = useState(false);
	const [projectSearch, setProjectSearch] = useState("");
	const [serviceSearch, setServiceSearch] = useState("");
	const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
		null,
	);

	// Fetch all projects
	const { data: allProjects } = api.project.all.useQuery();

	// Fetch current project data
	const { data: currentProject } = api.project.one.useQuery(
		{ projectId: projectId || "" },
		{ enabled: !!projectId },
	);

	// Fetch current environment
	const { data: currentEnvironment } = api.environment.one.useQuery(
		{ environmentId: environmentId || "" },
		{ enabled: !!environmentId },
	);

	// Fetch environments for current project
	const { data: projectEnvironments } = api.environment.byProjectId.useQuery(
		{ projectId: projectId || "" },
		{ enabled: !!projectId },
	);

	// Close dropdowns on escape key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setProjectOpen(false);
				setServiceOpen(false);
				setEnvironmentOpen(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	// Extract services from current environment
	const services: ServiceItem[] = currentEnvironment
		? extractServicesFromEnvironment(currentEnvironment)
		: [];

	// Get current service
	const currentService = services.find((s) => s.id === serviceId);

	// Navigate to project's default environment
	const handleProjectSelect = (
		selectedProjectId: string,
		selectedEnvironmentId?: string,
	) => {
		const project = allProjects?.find((p) => p.projectId === selectedProjectId);
		if (project && project.environments.length > 0) {
			// Use provided environment or find production environment or use the first one
			const firstEnvironment = project.environments[0];
			const targetEnvId =
				selectedEnvironmentId ||
				project.environments.find((e) => e.name === "production")
					?.environmentId ||
				firstEnvironment?.environmentId;

			if (targetEnvId) {
				router.push(
					`/dashboard/project/${selectedProjectId}/environment/${targetEnvId}`,
				);
			}
		}
		setProjectOpen(false);
		setExpandedProjectId(null);
	};

	// Navigate to environment
	const handleEnvironmentSelect = (envId: string) => {
		router.push(`/dashboard/project/${projectId}/environment/${envId}`);
		setEnvironmentOpen(false);
	};

	// Navigate to service
	const handleServiceSelect = (service: ServiceItem) => {
		const serviceTypePath =
			service.type === "application" ? "application" : service.type;
		router.push(
			`/dashboard/project/${projectId}/environment/${environmentId}/services/${serviceTypePath}/${service.id}`,
		);
		setServiceOpen(false);
	};

	// Filter projects based on search
	const filteredProjects =
		allProjects?.filter(
			(p) =>
				p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
				p.description?.toLowerCase().includes(projectSearch.toLowerCase()),
		) || [];

	// Filter services based on search
	const filteredServices = services.filter(
		(s) =>
			s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
			s.appName?.toLowerCase().includes(serviceSearch.toLowerCase()),
	);

	// If we're just on the projects page, show simple breadcrumb
	if (!projectId) {
		return (
			<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
				<div className="flex items-center gap-2">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />
					<div className="flex items-center gap-2">
						<FolderInput className="size-4 text-muted-foreground" />
						<span className="font-medium">Projects</span>
					</div>
				</div>
			</header>
		);
	}

	return (
		<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
			<div className="flex items-center gap-2">
				<SidebarTrigger className="-ml-1" />
				<Separator orientation="vertical" className="mr-2 h-4" />

				<div className="flex items-center">
					{/* Project Selector */}
					<Popover open={projectOpen} onOpenChange={setProjectOpen}>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								aria-expanded={projectOpen}
								className="h-auto px-2 py-1.5 hover:bg-accent gap-2"
							>
								<FolderInput className="size-4 text-muted-foreground" />
								<span className="font-medium max-w-[150px] truncate">
									{currentProject?.name || "Select Project"}
								</span>
								<ChevronDown className="size-4 text-muted-foreground" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							className="w-[380px] p-0"
							align="start"
							sideOffset={8}
						>
							<Command shouldFilter={false}>
								<div className="relative">
									<CommandInput
										placeholder="Find Project..."
										value={projectSearch}
										onValueChange={setProjectSearch}
										className="w-full focus:ring-0"
									/>
									<kbd className="pointer-events-none h-5 absolute right-2 top-1/2 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 flex">
										Esc
									</kbd>
								</div>
								<CommandList>
									<CommandEmpty>No projects found.</CommandEmpty>
									<CommandGroup>
										<ScrollArea className="h-[300px]">
											{filteredProjects.map((project) => {
												const totalServices = project.environments.reduce(
													(total, env) => total + countEnvironmentServices(env),
													0,
												);
												const isSelected = project.projectId === projectId;
												const isExpanded =
													expandedProjectId === project.projectId;

												return (
													<div key={project.projectId}>
														<CommandItem
															value={project.projectId}
															onSelect={() => {
																if (project.environments.length > 1) {
																	setExpandedProjectId(
																		isExpanded ? null : project.projectId,
																	);
																} else {
																	handleProjectSelect(project.projectId);
																}
															}}
															className="flex items-center justify-between py-3 px-2 cursor-pointer"
														>
															<div className="flex items-center gap-3">
																<div className="flex items-center justify-center size-8 rounded-md bg-muted text-xs font-semibold uppercase">
																	{project.name.slice(0, 2)}
																</div>
																<div className="flex flex-col">
																	<span className="font-medium">
																		{project.name}
																	</span>
																	<span className="text-xs text-muted-foreground">
																		{project.environments.length} env
																		{project.environments.length !== 1
																			? "s"
																			: ""}{" "}
																		· {totalServices} service
																		{totalServices !== 1 ? "s" : ""}
																	</span>
																</div>
															</div>
															<div className="flex items-center gap-2">
																{isSelected && (
																	<Check className="size-4 text-primary" />
																)}
																{project.environments.length > 1 && (
																	<ChevronRight
																		className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
																	/>
																)}
															</div>
														</CommandItem>

														{/* Expanded environments */}
														{isExpanded && (
															<div className="ml-11 border-l pl-3 py-1 space-y-1">
																{project.environments.map((env) => {
																	const envServices =
																		countEnvironmentServices(env);
																	const isEnvSelected =
																		env.environmentId === environmentId;

																	return (
																		<CommandItem
																			key={env.environmentId}
																			value={env.environmentId}
																			onSelect={() =>
																				handleProjectSelect(
																					project.projectId,
																					env.environmentId,
																				)
																			}
																			className="flex items-center justify-between py-2 px-2 cursor-pointer text-sm"
																		>
																			<div className="flex items-center gap-2">
																				<p className="text-xs">{env.name}</p>
																				<span className="text-xs text-muted-foreground">
																					{envServices} service
																					{envServices !== 1 ? "s" : ""}
																				</span>
																			</div>
																			{isEnvSelected && (
																				<Check className="size-3 text-primary" />
																			)}
																		</CommandItem>
																	);
																})}
															</div>
														)}
													</div>
												);
											})}
										</ScrollArea>
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>

					{/* Environment Selector */}
					{projectEnvironments && projectEnvironments.length > 1 && (
						<Popover open={environmentOpen} onOpenChange={setEnvironmentOpen}>
							<PopoverTrigger asChild>
								<Button
									variant="ghost"
									aria-expanded={environmentOpen}
									className="h-auto px-2 py-1.5 hover:bg-accent gap-1"
								>
									<p className="text-xs font-normal">
										{currentEnvironment?.name || "production"}
									</p>
									<ChevronDown className="size-3 text-muted-foreground" />
								</Button>
							</PopoverTrigger>
							<PopoverContent
								className="w-[200px] p-1"
								align="start"
								sideOffset={8}
							>
								<div className="space-y-1">
									{projectEnvironments.map((env) => {
										const isSelected = env.environmentId === environmentId;
										return (
											<button
												type="button"
												key={env.environmentId}
												onClick={() =>
													handleEnvironmentSelect(env.environmentId)
												}
												className="flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent cursor-pointer"
											>
												<p className="text-xs">{env.name}</p>
												{isSelected && (
													<Check className="size-3 text-primary" />
												)}
											</button>
										);
									})}
								</div>
							</PopoverContent>
						</Popover>
					)}

					{projectEnvironments && projectEnvironments.length === 1 && (
						<p className="text-xs font-normal ml-1">
							{currentEnvironment?.name || "production"}
						</p>
					)}

					{/* Service Selector - only show when viewing a service */}
					{serviceId && currentService && (
						<>
							<Separator orientation="vertical" className="mx-2 h-6" />

							<Popover open={serviceOpen} onOpenChange={setServiceOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="ghost"
										aria-expanded={serviceOpen}
										className="h-auto px-2 py-1.5 hover:bg-accent gap-2"
									>
										{getServiceIcon(currentService.type)}
										<span className="font-medium max-w-[150px] truncate">
											{currentService.name}
										</span>
										<ChevronDown className="size-4 text-muted-foreground" />
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className="w-[350px] p-0"
									align="start"
									sideOffset={8}
								>
									<Command shouldFilter={false}>
										<div className="relative">
											<CommandInput
												placeholder="Find Service..."
												value={serviceSearch}
												onValueChange={setServiceSearch}
												className="w-full focus:ring-0"
											/>
											<kbd className="pointer-events-none h-5 select-none absolute right-2 top-1/2 -translate-y-1/2 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 flex">
												Esc
											</kbd>
										</div>
										<CommandList>
											<CommandEmpty>No services found.</CommandEmpty>
											<CommandGroup>
												<ScrollArea className="h-[300px]">
													{filteredServices.map((service) => {
														const isSelected = service.id === serviceId;
														return (
															<CommandItem
																key={service.id}
																value={service.id}
																onSelect={() => handleServiceSelect(service)}
																className="flex items-center justify-between py-3 px-2 cursor-pointer"
															>
																<div className="flex items-center gap-3">
																	<div className="flex items-center justify-center size-8 rounded-md bg-muted">
																		{getServiceIcon(service.type)}
																	</div>
																	<div className="flex flex-col">
																		<span className="font-medium">
																			{service.name}
																		</span>
																		<span className="text-xs text-muted-foreground capitalize">
																			{service.type}
																		</span>
																	</div>
																</div>
																{isSelected && (
																	<Check className="size-4 text-primary" />
																)}
															</CommandItem>
														);
													})}
												</ScrollArea>
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>

							{/* Close button to go back to environment */}
							<Button
								variant="ghost"
								size="icon"
								className="size-7 ml-1"
								onClick={() => {
									router.push(
										`/dashboard/project/${projectId}/environment/${environmentId}`,
									);
								}}
							>
								<X className="size-4 text-muted-foreground" />
							</Button>
						</>
					)}
				</div>
			</div>
		</header>
	);
};
