import {
	Activity,
	AlertTriangle,
	BarChart3,
	Bell,
	Boxes,
	ChevronDown,
	CircuitBoard,
	FileText,
	Folder,
	Grid2X2,
	LayoutGrid,
	List,
	Loader2,
	MessageSquare,
	MoreHorizontal,
	Radio,
	Search,
	Settings2,
	Star,
	TrashIcon,
	Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
	type ComponentType,
	type KeyboardEvent,
	type MouseEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	LibsqlIcon,
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { Logo } from "@/components/shared/logo";
import { TagFilter } from "@/components/shared/tag-filter";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type RouterOutputs } from "@/utils/api";
import { useDebounce } from "@/utils/hooks/use-debounce";
import { HandleProject } from "./handle-project";
import { ProjectCanvas } from "./project-canvas";
import { ProjectEnvironment as ProjectEnvironmentActions } from "./project-environment";

type Project = RouterOutputs["project"]["all"][number];
type ServiceKind =
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql";

type ServiceItem = {
	id: string;
	name: string;
	type: ServiceKind;
	status?: string;
	icon?: string | null;
};

type ServiceCollection = {
	key: keyof Project["environments"][number];
	type: ServiceKind;
	idKey:
		| "applicationId"
		| "composeId"
		| "postgresId"
		| "mysqlId"
		| "mariadbId"
		| "mongoId"
		| "redisId"
		| "libsqlId";
};

const SERVICE_COLLECTIONS: ServiceCollection[] = [
	{ key: "applications", type: "application", idKey: "applicationId" },
	{ key: "compose", type: "compose", idKey: "composeId" },
	{ key: "postgres", type: "postgres", idKey: "postgresId" },
	{ key: "mysql", type: "mysql", idKey: "mysqlId" },
	{ key: "mariadb", type: "mariadb", idKey: "mariadbId" },
	{ key: "mongo", type: "mongo", idKey: "mongoId" },
	{ key: "redis", type: "redis", idKey: "redisId" },
	{ key: "libsql", type: "libsql", idKey: "libsqlId" },
];

const SERVICE_ICONS: Record<
	ServiceKind,
	ComponentType<{ className?: string }>
> = {
	application: Boxes,
	compose: CircuitBoard,
	postgres: PostgresqlIcon,
	mysql: MysqlIcon,
	mariadb: MariadbIcon,
	mongo: MongodbIcon,
	redis: RedisIcon,
	libsql: LibsqlIcon,
};

const SORT_OPTIONS = [
	{ value: "createdAt-desc", label: "Sort By: Recent Activity" },
	{ value: "createdAt-asc", label: "Sort By: Creation Date" },
	{ value: "name-asc", label: "Sort By: Alphabetical" },
	{ value: "name-desc", label: "Sort By: Alphabetical (Z-A)" },
	{ value: "services-desc", label: "Sort By: Most Services" },
	{ value: "services-asc", label: "Sort By: Least Services" },
];

const getServiceItems = (
	environment: Project["environments"][number] | undefined,
): ServiceItem[] => {
	if (!environment) return [];

	return SERVICE_COLLECTIONS.flatMap(({ key, type, idKey }) => {
		const collection = environment[key] as unknown as
			| Array<Record<string, unknown>>
			| undefined;

		return (collection ?? []).flatMap((service) => {
			const id = service[idKey];
			if (typeof id !== "string") return [];

			const status = service.applicationStatus ?? service.composeStatus;
			return [
				{
					id,
					name: typeof service.name === "string" ? service.name : type,
					type,
					status: typeof status === "string" ? status : undefined,
					icon: typeof service.icon === "string" ? service.icon : null,
				},
			];
		});
	});
};

const getProjectServices = (project: Project) =>
	project.environments.flatMap((environment) => getServiceItems(environment));

const getProjectServiceCount = (project: Project) =>
	project.environments.reduce(
		(total, environment) => total + getServiceItems(environment).length,
		0,
	);

const isServiceOnline = (status?: string) =>
	status === "done" || status === "running" || status === "healthy";

const getProjectHref = (project: Project) => {
	const environment =
		project.environments.find((item) => item.isDefault) ||
		project.environments[0];
	return environment
		? `/dashboard/project/${project.projectId}/environment/${environment.environmentId}`
		: "#";
};

const stopCardNavigation = (event: MouseEvent<HTMLElement>) => {
	event.preventDefault();
	event.stopPropagation();
};

const railLinkClass =
	"flex h-9 w-10 items-center justify-center rounded-lg text-[#6c6b7b] transition-colors hover:bg-white/[0.03] hover:text-white";

const ProjectsRail = () => (
	<aside className="fixed inset-y-0 left-0 z-30 flex w-14 flex-col bg-[#13111c] text-white">
		<div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden pb-3 pt-4">
			<div className="h-[78px] px-2">
				<Link
					aria-label="Dokploy"
					className="flex h-8 w-10 items-center px-1"
					href="/dashboard/home"
				>
					<Logo className="size-8" />
				</Link>
			</div>
			<div className="my-3 h-px w-full bg-white/[0.08]" />
			<div className="px-2">
				<nav
					aria-label="Projects navigation"
					className="flex flex-col gap-1 pb-5"
				>
					<Link
						aria-label="Projects"
						className={`${railLinkClass} bg-white/[0.06] text-[#a667e4]`}
						href="/dashboard/projects"
						title="Projects"
					>
						<Grid2X2 className="size-4" />
					</Link>
					<Link
						aria-label="Templates"
						className={railLinkClass}
						href="/dashboard/home"
						title="Templates"
					>
						<Boxes className="size-4" />
					</Link>
					<Link
						aria-label="Usage"
						className={railLinkClass}
						href="/dashboard/overview"
						title="Usage"
					>
						<BarChart3 className="size-4" />
					</Link>
					<Link
						aria-label="People"
						className={railLinkClass}
						href="/dashboard/settings/users"
						title="People"
					>
						<Users className="size-4" />
					</Link>
					<Link
						aria-label="Workspace settings"
						className={railLinkClass}
						href="/dashboard/settings/profile"
						title="Workspace settings"
					>
						<Settings2 className="size-4" />
					</Link>
				</nav>
			</div>
			<div className="my-3 h-px w-full bg-white/[0.08]" />
			<div className="px-2">
				<nav aria-label="Resources navigation" className="flex flex-col gap-1">
					<a
						aria-label="Documentation"
						className={railLinkClass}
						href="https://docs.dokploy.com"
						title="Documentation"
					>
						<FileText className="size-4" />
					</a>
					<a
						aria-label="Community"
						className={railLinkClass}
						href="https://github.com/Dokploy/dokploy"
						title="Community"
					>
						<Radio className="size-4" />
					</a>
					<a
						aria-label="Support"
						className={railLinkClass}
						href="https://github.com/Dokploy/dokploy/discussions"
						title="Support"
					>
						<MessageSquare className="size-4" />
					</a>
				</nav>
			</div>
			<div className="flex-1" />
		</div>
		<div className="flex h-[59px] justify-center border-t border-white/[0.08] px-2 py-[9px]">
			<button
				aria-label="Account"
				className="flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.03]"
				type="button"
			>
				<div className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-[#6b65a7] via-[#453d77] to-[#171329] text-[10px] font-semibold text-white">
					W
				</div>
			</button>
		</div>
	</aside>
);

interface ProjectsTopbarProps {
	environmentName: string;
	onSurfaceModeChange: (mode: "canvas" | "list") => void;
	projectName: string;
	surfaceMode: "canvas" | "list";
}

const ProjectsTopbar = ({
	environmentName,
	onSurfaceModeChange,
	projectName,
	surfaceMode,
}: ProjectsTopbarProps) => (
	<header className="flex h-14 items-center justify-between pl-4 pr-2 text-[#6c6b7b]">
		<div className="flex min-w-0 items-center gap-2 text-sm">
			<button
				aria-label="Select project"
				className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.04] hover:text-white"
				type="button"
			>
				<span className="size-3 shrink-0 rounded-full bg-gradient-to-br from-[#60599c] via-[#403769] to-[#171329]" />
				<span className="max-w-[160px] truncate font-medium text-[#e5e1ed]">
					{projectName}
				</span>
				<ChevronDown className="size-3.5 shrink-0 text-[#686475]" />
			</button>
			<span className="text-[#4f4b5e]">/</span>
			<button
				aria-label="Select environment"
				className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.04] hover:text-white"
				type="button"
			>
				<span className="max-w-[160px] truncate font-medium text-[#e5e1ed]">
					{environmentName}
				</span>
				<ChevronDown className="size-3.5 shrink-0 text-[#686475]" />
			</button>
		</div>
		<div className="flex items-center gap-1">
			<button
				aria-label="Activity"
				className="flex size-[30px] items-center justify-center rounded-md transition-colors hover:bg-white/[0.04] hover:text-white"
				type="button"
			>
				<Activity className="size-4" />
			</button>
			<button
				aria-label={
					surfaceMode === "canvas"
						? "Show project list"
						: "Show architecture canvas"
				}
				className="flex size-[30px] items-center justify-center rounded-md transition-colors hover:bg-white/[0.04] hover:text-white"
				onClick={() =>
					onSurfaceModeChange(surfaceMode === "canvas" ? "list" : "canvas")
				}
				type="button"
			>
				{surfaceMode === "canvas" ? (
					<List className="size-4" />
				) : (
					<Grid2X2 className="size-4" />
				)}
			</button>
			<button
				aria-label="Notifications"
				className="flex size-[30px] items-center justify-center rounded-md transition-colors hover:bg-white/[0.04] hover:text-white"
				type="button"
			>
				<Bell className="size-3.5" />
			</button>
		</div>
	</header>
);

interface ProjectCardProps {
	project: Project;
	permissions?: RouterOutputs["user"]["getPermissions"];
	onDelete: (projectId: string) => Promise<void>;
}

const ProjectCard = ({ project, permissions, onDelete }: ProjectCardProps) => {
	const [isFavorite, setIsFavorite] = useState(false);
	const environment =
		project.environments.find((item) => item.isDefault) ||
		project.environments[0];
	const services = getProjectServices(project);
	const totalServices = services.length;
	const onlineServices = services.filter((service) =>
		isServiceOnline(service.status),
	).length;
	const hasActiveServices = totalServices > 0;
	const statusDotClass =
		totalServices === 0
			? "bg-[#6c6b7b]"
			: onlineServices === totalServices
				? "bg-green-500"
				: "bg-amber-400";

	const handleFavorite = (event: MouseEvent<HTMLButtonElement>) => {
		stopCardNavigation(event);
		setIsFavorite((value) => !value);
	};

	const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (event.key === "Enter" || event.key === " ") event.preventDefault();
	};

	return (
		<article
			className="group/card relative h-[288px] overflow-hidden rounded-lg bg-[#1c1a28] outline outline-1 outline-white/10 shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all hover:bg-[#211f2d] hover:outline-white/15 hover:shadow-[0_3px_8px_rgba(0,0,0,0.2)]"
			onKeyDown={handleCardKeyDown}
		>
			<Link
				aria-label={`View project ${project.name}`}
				className="absolute inset-0 z-0"
				href={getProjectHref(project)}
			>
				<span className="sr-only">View Project</span>
			</Link>

			<div className="pointer-events-none relative z-10 flex h-full flex-col">
				<div className="flex items-center gap-1.5 px-4 pb-4 pt-4">
					<span className="truncate text-sm font-semibold text-white">
						{project.name}
					</span>
					<div className="ml-auto flex items-center gap-1">
						<button
							aria-pressed={isFavorite}
							aria-label={
								isFavorite ? "Remove from favorites" : "Add to favorites"
							}
							className={`pointer-events-auto relative z-20 shrink-0 rounded-md p-1.5 text-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a667e4] ${isFavorite ? "text-[#a667e4]" : "text-[#6c6b7b] hover:text-white"}`}
							onClick={handleFavorite}
							type="button"
						>
							<Star
								className="size-4"
								fill={isFavorite ? "currentColor" : "none"}
							/>
						</button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									aria-label={`Actions for ${project.name}`}
									className="pointer-events-auto z-20 size-6 rounded-md p-0 text-[#6c6b7b] opacity-0 transition-opacity hover:bg-white/5 hover:text-white group-hover/card:opacity-100"
									onClick={(event) => event.stopPropagation()}
									size="icon"
									variant="ghost"
								>
									<MoreHorizontal className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-[200px] space-y-2 overflow-y-auto"
								onClick={(event) => event.stopPropagation()}
							>
								<DropdownMenuLabel className="font-normal">
									Actions
								</DropdownMenuLabel>
								<div onClick={(event) => event.stopPropagation()}>
									<ProjectEnvironmentActions projectId={project.projectId} />
								</div>
								<div onClick={(event) => event.stopPropagation()}>
									<HandleProject projectId={project.projectId} />
								</div>
								{permissions?.project.delete && (
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<DropdownMenuItem
												className="w-full cursor-pointer space-x-3"
												onClick={(event) => event.stopPropagation()}
												onSelect={(event) => event.preventDefault()}
											>
												<TrashIcon className="size-4" />
												<span>Delete</span>
											</DropdownMenuItem>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													Are you sure to delete this project?
												</AlertDialogTitle>
												{hasActiveServices ? (
													<div className="flex flex-row gap-4 rounded-lg bg-yellow-50 p-2 dark:bg-yellow-950">
														<AlertTriangle className="text-yellow-600 dark:text-yellow-400" />
														<span className="text-sm text-yellow-600 dark:text-yellow-400">
															You have active services, please delete them first
														</span>
													</div>
												) : (
													<AlertDialogDescription>
														This action cannot be undone
													</AlertDialogDescription>
												)}
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>Cancel</AlertDialogCancel>
												<AlertDialogAction
													disabled={hasActiveServices}
													onClick={() => onDelete(project.projectId)}
												>
													Delete
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>

				<div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
					<div
						className="relative flex min-h-[220px] flex-1 items-center justify-center rounded bg-[#13111c] py-6 transition-colors group-hover/card:bg-[#211f2d]"
						style={{
							backgroundImage:
								"radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
							backgroundSize: "10px 10px",
							backgroundPosition: "calc(50% - 5px) calc(50% - 10px)",
							boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.16)",
						}}
					>
						{services.length > 0 && (
							<div className="-translate-y-2">
								<div
									className="grid w-fit gap-[10px]"
									style={{
										gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, Math.ceil(Math.sqrt(services.length))))}, 40px)`,
									}}
								>
									{services.map((service) => {
										const Icon = SERVICE_ICONS[service.type];
										const serviceHref = environment
											? `/dashboard/project/${project.projectId}/environment/${environment.environmentId}/services/${service.type}/${service.id}`
											: "#";
										return (
											<Link
												aria-label={service.name}
												className="pointer-events-auto group/icon rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a667e4]"
												href={serviceHref}
												key={`${service.type}-${service.id}`}
											>
												<div className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-[#1c1a28] transition-colors group-hover/icon:bg-[#2b283b]">
													{service.icon ? (
														<img
															alt=""
															className="size-6 object-contain"
															src={service.icon}
														/>
													) : (
														<Icon className="size-6" />
													)}
												</div>
											</Link>
										);
									})}
								</div>
							</div>
						)}

						<div className="absolute bottom-0 left-0 right-0 flex items-center px-2 py-2 text-xs text-[#a1a0ab]">
							<div className="flex items-center gap-2">
								<div
									className={`size-1.5 shrink-0 rounded-full ${statusDotClass}`}
								/>
								<span>{environment?.name || "production"}</span>
								<span>·</span>
								<span>
									{onlineServices}/{totalServices} services online
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</article>
	);
};

export const ShowProjects = () => {
	const utils = api.useUtils();
	const router = useRouter();
	const { data, isPending } = api.project.all.useQuery();
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { mutateAsync: removeProject } = api.project.remove.useMutation();
	const { data: availableTags } = api.tag.all.useQuery();

	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [surfaceMode, setSurfaceMode] = useState<"canvas" | "list">("canvas");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [searchQuery, setSearchQuery] = useState(
		router.isReady && typeof router.query.q === "string" ? router.query.q : "",
	);
	const debouncedSearchQuery = useDebounce(searchQuery, 500);

	const [sortBy, setSortBy] = useState<string>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("projectsSort") || "createdAt-desc";
		}
		return "createdAt-desc";
	});

	const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("projectsTagFilter");
			return saved ? JSON.parse(saved) : [];
		}
		return [];
	});

	useEffect(() => {
		localStorage.setItem("projectsSort", sortBy);
	}, [sortBy]);

	useEffect(() => {
		localStorage.setItem("projectsTagFilter", JSON.stringify(selectedTagIds));
	}, [selectedTagIds]);

	useEffect(() => {
		if (isSearchOpen) searchInputRef.current?.focus();
	}, [isSearchOpen]);

	useEffect(() => {
		if (!availableTags) return;
		const validIds = new Set(availableTags.map((tag) => tag.tagId));
		setSelectedTagIds((previous) => {
			const filtered = previous.filter((id) => validIds.has(id));
			return filtered.length === previous.length ? previous : filtered;
		});
	}, [availableTags]);

	useEffect(() => {
		if (!router.isReady) return;
		const urlQuery = typeof router.query.q === "string" ? router.query.q : "";
		if (urlQuery !== searchQuery) setSearchQuery(urlQuery);
	}, [router.isReady, router.query.q]);

	useEffect(() => {
		if (!router.isReady) return;
		const urlQuery = typeof router.query.q === "string" ? router.query.q : "";
		if (debouncedSearchQuery === urlQuery) return;

		const newQuery = { ...router.query };
		if (debouncedSearchQuery) newQuery.q = debouncedSearchQuery;
		else delete newQuery.q;

		router.replace({ pathname: router.pathname, query: newQuery }, undefined, {
			shallow: true,
		});
	}, [debouncedSearchQuery, router]);

	const filteredProjects = useMemo(() => {
		if (!data) return [];

		const normalizedSearch = debouncedSearchQuery.toLowerCase();
		let filtered = data.filter(
			(project) =>
				project.name.toLowerCase().includes(normalizedSearch) ||
				project.description?.toLowerCase().includes(normalizedSearch),
		);

		if (selectedTagIds.length > 0) {
			filtered = filtered.filter((project) =>
				project.projectTags?.some((item) =>
					selectedTagIds.includes(item.tag.tagId),
				),
			);
		}

		const [field, direction] = sortBy.split("-");
		return [...filtered].sort((a, b) => {
			let comparison = 0;
			if (field === "name") comparison = a.name.localeCompare(b.name);
			if (field === "createdAt") {
				comparison =
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
			}
			if (field === "services") {
				comparison = getProjectServiceCount(a) - getProjectServiceCount(b);
			}
			return direction === "asc" ? comparison : -comparison;
		});
	}, [data, debouncedSearchQuery, selectedTagIds, sortBy]);

	const canvasProject = data?.[0];
	const canvasEnvironment =
		canvasProject?.environments.find((item) => item.isDefault) ||
		canvasProject?.environments[0];
	const canvasServices = canvasEnvironment
		? getServiceItems(canvasEnvironment)
		: [];

	const deleteProject = async (projectId: string) => {
		await removeProject({ projectId })
			.then(() => toast.success("Project deleted successfully"))
			.catch(() => toast.error("Error deleting this project"))
			.finally(() => utils.project.all.invalidate());
	};

	return (
		<div className="-mx-4 -mb-4 min-h-screen bg-[#13111c] pr-2 text-white">
			<ProjectsRail />
			<div className="ml-14 min-h-screen min-w-0">
				<ProjectsTopbar
					environmentName={canvasEnvironment?.name || "production"}
					onSurfaceModeChange={setSurfaceMode}
					projectName={canvasProject?.name || "eterniza"}
					surfaceMode={surfaceMode}
				/>
				<main
					className={
						surfaceMode === "canvas"
							? "h-[calc(100vh-64px)] overflow-hidden bg-[#13111c]"
							: "h-[calc(100vh-56px)] overflow-y-auto rounded-lg border border-white/[0.12] bg-[#13111c]"
					}
				>
					{surfaceMode === "canvas" ? (
						<ProjectCanvas
							environmentName={canvasEnvironment?.name || "production"}
							projectName={canvasProject?.name || "eterniza"}
							services={canvasServices}
						/>
					) : (
						<div className="mx-auto w-full max-w-[1120px] space-y-8 px-5 pb-24 pt-12 sm:px-12 md:px-16">
							<div className="flex flex-wrap items-center gap-3">
								<h1 className="flex-1 text-2xl font-normal leading-[33px]">
									Projects
								</h1>
								{isSearchOpen ? (
									<div className="order-last flex h-[34px] w-full items-center gap-2 rounded-md border border-white/20 bg-transparent px-2.5 py-1.5 text-sm text-[#a1a0ab] sm:order-1 sm:w-56">
										<Search className="size-3.5 shrink-0" />
										<input
											aria-label="Search projects"
											className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#a1a0ab]"
											onChange={(event) => setSearchQuery(event.target.value)}
											onKeyDown={(event) => {
												if (event.key === "Escape") setIsSearchOpen(false);
											}}
											placeholder="Search projects..."
											ref={searchInputRef}
											value={searchQuery}
										/>
										<kbd className="rounded border border-white/10 px-1 text-[10px] text-[#6c6b7b]">
											Esc
										</kbd>
									</div>
								) : (
									<button
										aria-label="Search projects... ⌘ K"
										className="group order-last flex h-[34px] w-full items-center gap-2 rounded-md border border-white/20 bg-transparent px-2.5 py-1.5 text-sm text-[#a1a0ab] transition-colors hover:border-white/35 sm:order-1 sm:w-56"
										onClick={() => setIsSearchOpen(true)}
										type="button"
									>
										<Search className="size-3.5 shrink-0" />
										<span className="flex-1 text-left">Search projects...</span>
										<kbd className="rounded border border-white/10 px-1 text-[10px] text-[#6c6b7b]">
											⌘ K
										</kbd>
									</button>
								)}
								{permissions?.project.create && (
									<div className="sm:order-2">
										<HandleProject
											buttonClassName="h-[34px] rounded-md border border-[#853bce] bg-[#853bce] px-3 text-sm font-medium text-white shadow-none hover:bg-[#9651dc]"
											buttonLabel="New"
										/>
									</div>
								)}
							</div>

							<div className="grid gap-8">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<button
											className="flex items-center gap-1.5 text-sm text-white transition-colors hover:text-[#c9a9ee]"
											type="button"
										>
											<LayoutGrid className="size-4" />
											<span>{filteredProjects.length} Projects</span>
										</button>
										<span
											aria-hidden="true"
											className="hidden h-5 w-0.5 shrink-0 rounded-full bg-white/10 sm:block"
										/>
										<div className="relative">
											<label className="sr-only" htmlFor="project-sort">
												Project sort
											</label>
											<select
												aria-label="Project sort"
												className="h-[34px] w-[180px] appearance-none bg-transparent pl-0 pr-6 text-sm text-[#a1a0ab] outline-none hover:text-white"
												id="project-sort"
												onChange={(event) => setSortBy(event.target.value)}
												value={sortBy}
											>
												{SORT_OPTIONS.map((option) => (
													<option
														className="bg-[#1c1a28] text-white"
														key={option.value}
														value={option.value}
													>
														{option.label}
													</option>
												))}
											</select>
											<ChevronDown className="pointer-events-none absolute right-0 top-1/2 size-3 -translate-y-1/2 text-[#6c6b7b]" />
										</div>
										{availableTags && availableTags.length > 0 && (
											<TagFilter
												tags={availableTags.map((tag) => ({
													id: tag.tagId,
													name: tag.name,
													color: tag.color || undefined,
												}))}
												selectedTags={selectedTagIds}
												onTagsChange={setSelectedTagIds}
											/>
										)}
									</div>
									<div className="flex items-center gap-3">
										<div className="flex h-[34px] rounded-lg border border-white/5 bg-[#1c1a28]">
											<button
												aria-label="Grid view"
												aria-pressed={viewMode === "grid"}
												className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${viewMode === "grid" ? "text-white" : "text-[#6c6b7b] hover:text-white"}`}
												onClick={() => setViewMode("grid")}
												type="button"
											>
												<Grid2X2 className="size-3.5" />
											</button>
											<button
												aria-label="List view"
												aria-pressed={viewMode === "list"}
												className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${viewMode === "list" ? "text-white" : "text-[#6c6b7b] hover:text-white"}`}
												onClick={() => setViewMode("list")}
												type="button"
											>
												<List className="size-3.5" />
											</button>
										</div>
									</div>
								</div>

								{isPending ? (
									<div className="flex min-h-[288px] items-center justify-center gap-2 text-sm text-[#a1a0ab]">
										<span>Loading...</span>
										<Loader2 className="size-4 animate-spin" />
									</div>
								) : filteredProjects.length === 0 ? (
									<div className="flex min-h-[288px] flex-col items-center justify-center gap-3 text-sm text-[#a1a0ab]">
										<Folder className="size-6" />
										<span>No projects found</span>
									</div>
								) : (
									<div
										className={
											viewMode === "grid"
												? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
												: "grid grid-cols-1 gap-3"
										}
									>
										{filteredProjects.map((project) => (
											<ProjectCard
												key={project.projectId}
												onDelete={deleteProject}
												permissions={permissions}
												project={project}
											/>
										))}
									</div>
								)}
							</div>
						</div>
					)}
				</main>
			</div>
		</div>
	);
};
