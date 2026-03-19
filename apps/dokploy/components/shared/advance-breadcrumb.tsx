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
import { type ComponentType, useEffect, useMemo, useState } from "react";
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
import { api, type RouterOutputs } from "@/utils/api";

type ProjectItem = RouterOutputs["project"]["all"][number];
type ProjectEnvironment = ProjectItem["environments"][number];
type EnvironmentDetails = RouterOutputs["environment"]["one"];

type ServiceItem = {
	id: string;
	name: string;
	type: ServiceType;
};

type NamedService = {
	name: string;
};

type EnvironmentServiceCollections = {
	applications: (NamedService & { applicationId: string })[];
	compose: (NamedService & { composeId: string })[];
	postgres: (NamedService & { postgresId: string })[];
	mysql: (NamedService & { mysqlId: string })[];
	mariadb: (NamedService & { mariadbId: string })[];
	redis: (NamedService & { redisId: string })[];
	mongo: (NamedService & { mongoId: string })[];
};

type ServiceCollections = Pick<
	ProjectEnvironment,
	| "applications"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "redis"
	| "mongo"
>;

const SERVICE_COLLECTION_KEYS = [
	"applications",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"redis",
	"mongo",
] as const satisfies ReadonlyArray<keyof ServiceCollections>;

const SERVICE_QUERY_KEYS = [
	"applicationId",
	"composeId",
	"postgresId",
	"mysqlId",
	"mariadbId",
	"redisId",
	"mongoId",
] as const;

const SERVICE_ICONS: Record<
	ServiceType,
	ComponentType<{ className?: string }>
> = {
	application: GlobeIcon,
	compose: CircuitBoard,
	postgres: PostgresqlIcon,
	mysql: MysqlIcon,
	mariadb: MariadbIcon,
	redis: RedisIcon,
	mongo: MongodbIcon,
};

const getStringQueryParam = (value: string | string[] | undefined) =>
	typeof value === "string" ? value : null;

const includesSearch = (value: string | null | undefined, search: string) =>
	value?.toLowerCase().includes(search.toLowerCase()) ?? false;

const getServiceIcon = (type: ServiceType, className = "size-4") => {
	const Icon = SERVICE_ICONS[type];
	return <Icon className={className} />;
};

const countEnvironmentServices = (environment: ServiceCollections): number =>
	SERVICE_COLLECTION_KEYS.reduce(
		(total, key) => total + environment[key].length,
		0,
	);

const mapServices = <T extends { name: string }>(
	items: readonly T[],
	getId: (item: T) => string,
	type: ServiceType,
): ServiceItem[] =>
	items.map((item) => ({
		id: getId(item),
		name: item.name,
		type,
	}));

const extractServicesFromEnvironment = (
	environment: EnvironmentDetails | null | undefined,
): ServiceItem[] => {
	if (!environment) return [];

	const servicesByType =
		environment as unknown as EnvironmentServiceCollections;

	return [
		...mapServices(
			servicesByType.applications,
			(item) => item.applicationId,
			"application",
		),
		...mapServices(servicesByType.compose, (item) => item.composeId, "compose"),
		...mapServices(
			servicesByType.postgres,
			(item) => item.postgresId,
			"postgres",
		),
		...mapServices(servicesByType.mysql, (item) => item.mysqlId, "mysql"),
		...mapServices(servicesByType.mariadb, (item) => item.mariadbId, "mariadb"),
		...mapServices(servicesByType.redis, (item) => item.redisId, "redis"),
		...mapServices(servicesByType.mongo, (item) => item.mongoId, "mongo"),
	];
};

const getTargetEnvironmentId = (
	project: ProjectItem,
	selectedEnvironmentId?: string,
) => {
	if (selectedEnvironmentId) return selectedEnvironmentId;

	const productionEnvironment = project.environments.find(
		(environment) => environment.name === "production",
	);

	return (
		productionEnvironment?.environmentId ??
		project.environments[0]?.environmentId
	);
};

export const AdvanceBreadcrumb = () => {
	const router = useRouter();
	const { query } = router;

	// Read IDs from URL (dynamic route segments)
	const projectId = getStringQueryParam(query.projectId);
	const environmentId = getStringQueryParam(query.environmentId);
	const serviceId =
		SERVICE_QUERY_KEYS.map((key) => getStringQueryParam(query[key])).find(
			(value): value is string => !!value,
		) ?? null;

	const [projectOpen, setProjectOpen] = useState(false);
	const [serviceOpen, setServiceOpen] = useState(false);
	const [environmentOpen, setEnvironmentOpen] = useState(false);
	const [projectSearch, setProjectSearch] = useState("");
	const [serviceSearch, setServiceSearch] = useState("");
	const [environmentSearch, setEnvironmentSearch] = useState("");
	const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
		null,
	);

	// Fetch all projects
	const { data: allProjects } = api.project.all.useQuery();

	// Fetch current project data
	const { data: currentProject } = api.project.one.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);

	// Fetch current environment
	const { data: currentEnvironment } = api.environment.one.useQuery(
		{ environmentId: environmentId ?? "" },
		{ enabled: !!environmentId },
	);

	// Fetch environments for current project
	const { data: projectEnvironments } = api.environment.byProjectId.useQuery(
		{ projectId: projectId ?? "" },
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

	const services = useMemo(
		() => extractServicesFromEnvironment(currentEnvironment),
		[currentEnvironment],
	);

	const currentService = useMemo(
		() => services.find((service) => service.id === serviceId),
		[serviceId, services],
	);

	// Navigate to project's default environment
	const handleProjectSelect = (
		selectedProjectId: string,
		selectedEnvironmentId?: string,
	) => {
		const project = allProjects?.find((p) => p.projectId === selectedProjectId);
		if (project) {
			const targetEnvironmentId = getTargetEnvironmentId(
				project,
				selectedEnvironmentId,
			);

			if (targetEnvironmentId) {
				router.push(
					`/dashboard/project/${selectedProjectId}/environment/${targetEnvironmentId}`,
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
		if (!environmentId) return;

		router.push(
			`/dashboard/project/${projectId}/environment/${environmentId}/services/${service.type}/${service.id}`,
		);
		setServiceOpen(false);
	};

	const filteredProjects = useMemo(
		() =>
			(allProjects ?? []).filter(
				(project) =>
					includesSearch(project.name, projectSearch) ||
					includesSearch(project.description, projectSearch),
			),
		[allProjects, projectSearch],
	);

	const filteredServices = useMemo(
		() =>
			services.filter((service) => includesSearch(service.name, serviceSearch)),
		[serviceSearch, services],
	);

	const filteredEnvironments = useMemo(
		() =>
			(projectEnvironments ?? []).filter((environment) =>
				includesSearch(environment.name, environmentSearch),
			),
		[environmentSearch, projectEnvironments],
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
										className="w-full focus-visible:ring-0"
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
																	<span className="text-muted-foreground">
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
									className="h-auto px-2 py-1.5 hover:bg-accent gap-2"
								>
									<span className="font-medium max-w-[150px] truncate">
										{currentEnvironment?.name || "production"}
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
											placeholder="Find Environment..."
											value={environmentSearch}
											onValueChange={setEnvironmentSearch}
											className="w-full focus-visible:ring-0"
										/>
										<kbd className="pointer-events-none h-5 absolute right-2 top-1/2 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 flex">
											Esc
										</kbd>
									</div>
									<CommandList>
										<CommandEmpty>No environments found.</CommandEmpty>
										<CommandGroup>
											<ScrollArea className="h-[300px]">
												{filteredEnvironments.map((env) => {
													const isSelected =
														env.environmentId === environmentId;
													return (
														<CommandItem
															key={env.environmentId}
															value={env.environmentId}
															onSelect={() =>
																handleEnvironmentSelect(env.environmentId)
															}
															className="flex items-center justify-between py-2 cursor-pointer"
														>
															<span className="font-medium">{env.name}</span>
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
					)}

					{projectEnvironments && projectEnvironments.length === 1 && (
						<p className="text-sm font-normal ml-1">
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
												className="w-full focus-visible:ring-0"
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
																className="flex items-center justify-between py-2 cursor-pointer"
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
