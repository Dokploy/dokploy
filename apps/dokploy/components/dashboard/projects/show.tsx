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
	Network,
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
	appName?: string | null;
	description?: string | null;
	serverId?: string | null;
	serverName?: string | null;
	serverIp?: string | null;
	serverUsername?: string | null;
	createdAt?: string | null;
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

const SERVICE_ID_KEYS: Record<ServiceKind, string> = {
	application: "applicationId",
	compose: "composeId",
	postgres: "postgresId",
	mysql: "mysqlId",
	mariadb: "mariadbId",
	mongo: "mongoId",
	redis: "redisId",
	libsql: "libsqlId",
};

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
			const server = service.server as
				| { name?: string; ipAddress?: string; username?: string }
				| undefined;
			return [
				{
					id,
					name: typeof service.name === "string" ? service.name : type,
					type,
					status: typeof status === "string" ? status : undefined,
					icon: typeof service.icon === "string" ? service.icon : null,
					appName: typeof service.appName === "string" ? service.appName : null,
					description:
						typeof service.description === "string" ? service.description : null,
					serverId:
						typeof service.serverId === "string" ? service.serverId : null,
					serverName: server?.name ?? null,
					serverIp: server?.ipAddress ?? null,
					serverUsername: server?.username ?? null,
					createdAt:
						typeof service.createdAt === "string" ? service.createdAt : null,
				},
			];
		});
	});
};

const getProjectServiceCount = (project: Project) =>
	project.environments.reduce(
		(total, environment) => total + getServiceItems(environment).length,
		0,
	);

const isServiceOnline = (status?: string) =>
	status === "done" || status === "running" || status === "healthy";

const getProjectCanvasHref = (project: Project) => {
	const environment =
		project.environments.find((item) => item.isDefault) ||
		project.environments[0];

	if (!environment) return "/dashboard/projects";

	return `/dashboard/projects?projectId=${encodeURIComponent(project.projectId)}&environmentId=${encodeURIComponent(environment.environmentId)}`;
};

const stopCardNavigation = (event: MouseEvent<HTMLElement>) => {
	event.preventDefault();
	event.stopPropagation();
};

const railLinkClass =
	"flex h-9 w-10 items-center justify-center rounded-lg text-[#6c6b7b] transition-colors hover:bg-white/[0.03] hover:text-white";

const ProjectsRail = () => (
	<aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col bg-[#13111c] text-white md:flex">
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

interface ProjectsBottomNavProps {
	canvasHref: string;
	surfaceMode: "canvas" | "list";
}

const ProjectsBottomNav = ({
	canvasHref,
	surfaceMode,
}: ProjectsBottomNavProps) => (
	<nav
		aria-label="Project navigation"
		className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-center justify-center gap-1 border-t border-white/[0.08] bg-[#13111c] px-4 py-2 md:hidden"
	>
		<div className="flex items-center gap-1">
			<Link
				aria-current={surfaceMode === "canvas" ? "page" : undefined}
				aria-label="Project canvas"
				className={`flex size-10 items-center justify-center rounded-lg transition-colors ${surfaceMode === "canvas" ? "bg-white/[0.1] text-white" : "text-[#6c6b7b] hover:bg-white/[0.03] hover:text-white"}`}
				href={canvasHref}
			>
				<Network className="size-5" />
			</Link>
			<Link
				aria-label="Usage"
				className="flex size-10 items-center justify-center rounded-lg text-[#6c6b7b] transition-colors hover:bg-white/[0.03] hover:text-white"
				href="/dashboard/overview"
			>
				<BarChart3 className="size-5" />
			</Link>
			<Link
				aria-label="Documentation"
				className="flex size-10 items-center justify-center rounded-lg text-[#6c6b7b] transition-colors hover:bg-white/[0.03] hover:text-white"
				href="https://docs.dokploy.com"
				rel="noreferrer"
				target="_blank"
			>
				<FileText className="size-5" />
			</Link>
			<Link
				aria-label="Workspace settings"
				className="flex size-10 items-center justify-center rounded-lg text-[#6c6b7b] transition-colors hover:bg-white/[0.03] hover:text-white"
				href="/dashboard/settings/profile"
			>
				<Settings2 className="size-5" />
			</Link>
		</div>
	</nav>
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
	<header className="flex h-14 items-center justify-between border-b border-white/[0.1] pl-4 pr-4 text-[#6c6b7b]">
		{surfaceMode === "canvas" ? (
			<div className="flex min-w-0 items-center gap-3 text-sm">
				<Link
					aria-label="Dokploy"
					className="flex size-8 shrink-0 items-center justify-center md:hidden"
					href="/dashboard/home"
				>
					<Logo className="size-8" />
				</Link>
				<span
					aria-hidden="true"
					className="h-5 w-px shrink-0 bg-white/[0.1] md:hidden"
				/>
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
		) : (
			<div aria-hidden="true" />
		)}
		<div className="flex items-center gap-1">
			{surfaceMode === "canvas" && (
				<>
					<button
						aria-label="Activity"
						className="hidden size-[30px] items-center justify-center rounded-md transition-colors hover:bg-white/[0.04] hover:text-white md:flex"
						type="button"
					>
						<Activity className="size-4" />
					</button>
					<button
						aria-label="Show project list"
						className="hidden size-[30px] items-center justify-center rounded-md transition-colors hover:bg-white/[0.04] hover:text-white md:flex"
						onClick={() => onSurfaceModeChange("list")}
						type="button"
					>
						<List className="size-4" />
					</button>
				</>
			)}
			<button
				aria-label="Notifications"
				className="flex size-[30px] items-center justify-center rounded-md transition-colors hover:bg-white/[0.04] hover:text-white"
				type="button"
			>
				<Bell className="size-3.5" />
			</button>
			{surfaceMode === "canvas" && (
				<>
					<span
						aria-hidden="true"
						className="block h-5 w-px bg-white/[0.1] md:hidden"
					/>
					<button
						aria-label="Account"
						className="flex size-10 items-center justify-center rounded-full transition-colors hover:bg-white/[0.04] md:hidden"
						type="button"
					>
						<span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-[#6b65a7] via-[#453d77] to-[#171329] text-[10px] font-semibold text-white">
							W
						</span>
					</button>
				</>
			)}
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
	const services = getServiceItems(environment);
	const previewServices = services.slice(0, 4);
	const hiddenServiceCount = Math.max(
		0,
		services.length - previewServices.length,
	);
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
				href={getProjectCanvasHref(project)}
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
							<div className="-translate-y-2 flex max-w-full flex-wrap justify-center gap-[10px]">
								{previewServices.map((service) => {
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
											title={service.name}
										>
											<div className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-[#1c1a28] transition-colors group-hover/icon:bg-[#2b283b]">
												{service.icon ? (
													<img
														alt={service.name}
														className="size-6 object-contain"
														src={service.icon}
													/>
												) : (
													<Icon aria-hidden="true" className="size-6" />
												)}
											</div>
										</Link>
									);
								})}
								{hiddenServiceCount > 0 && (
									<div
										aria-label={`${hiddenServiceCount} more services`}
										className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-[#1c1a28] text-xs font-medium text-[#a1a0ab]"
										title={`${hiddenServiceCount} more services`}
									>
										+{hiddenServiceCount}
									</div>
								)}
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
	const canvasActions = {
		application: {
			start: api.application.start.useMutation(),
			stop: api.application.stop.useMutation(),
			deploy: api.application.deploy.useMutation(),
		},
		compose: {
			start: api.compose.start.useMutation(),
			stop: api.compose.stop.useMutation(),
			deploy: api.compose.deploy.useMutation(),
		},
		postgres: {
			start: api.postgres.start.useMutation(),
			stop: api.postgres.stop.useMutation(),
			deploy: api.postgres.deploy.useMutation(),
		},
		mysql: {
			start: api.mysql.start.useMutation(),
			stop: api.mysql.stop.useMutation(),
			deploy: api.mysql.deploy.useMutation(),
		},
		mariadb: {
			start: api.mariadb.start.useMutation(),
			stop: api.mariadb.stop.useMutation(),
			deploy: api.mariadb.deploy.useMutation(),
		},
		mongo: {
			start: api.mongo.start.useMutation(),
			stop: api.mongo.stop.useMutation(),
			deploy: api.mongo.deploy.useMutation(),
		},
		redis: {
			start: api.redis.start.useMutation(),
			stop: api.redis.stop.useMutation(),
			deploy: api.redis.deploy.useMutation(),
		},
		libsql: {
			start: api.libsql.start.useMutation(),
			stop: api.libsql.stop.useMutation(),
			deploy: api.libsql.deploy.useMutation(),
		},
	};
	const canvasDeleteActions = {
		application: api.application.delete.useMutation(),
		compose: api.compose.delete.useMutation(),
		postgres: api.postgres.remove.useMutation(),
		mysql: api.mysql.remove.useMutation(),
		mariadb: api.mariadb.remove.useMutation(),
		mongo: api.mongo.remove.useMutation(),
		redis: api.redis.remove.useMutation(),
		libsql: api.libsql.remove.useMutation(),
	};
	const { mutateAsync: duplicateCanvasService } =
		api.project.duplicate.useMutation();
	const { data: availableTags } = api.tag.all.useQuery();

	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [surfaceMode, setSurfaceMode] = useState<"canvas" | "list">("list");
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

	useEffect(() => {
		if (!router.isReady) return;

		setSurfaceMode(
			typeof router.query.projectId === "string" ? "canvas" : "list",
		);
	}, [router.isReady, router.query.projectId]);

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

	const selectedProjectId =
		typeof router.query.projectId === "string" ? router.query.projectId : "";
	const selectedEnvironmentId =
		typeof router.query.environmentId === "string"
			? router.query.environmentId
			: "";
	const canvasProject = data?.find(
		(project) => project.projectId === selectedProjectId,
	);
	const canvasEnvironment =
		canvasProject?.environments.find(
			(item) => item.environmentId === selectedEnvironmentId,
		) ||
		canvasProject?.environments.find((item) => item.isDefault) ||
		canvasProject?.environments[0];
	const canvasServices = canvasEnvironment
		? getServiceItems(canvasEnvironment)
		: [];

	const handleSurfaceModeChange = (mode: "canvas" | "list") => {
		if (mode === "canvas" && !canvasProject) return;

		setSurfaceMode(mode);
		if (mode !== "list" || !router.isReady) return;

		const newQuery = { ...router.query };
		delete newQuery.projectId;
		delete newQuery.environmentId;

		void router.replace(
			{ pathname: router.pathname, query: newQuery },
			undefined,
			{
				shallow: true,
			},
		);
	};

	const handleCanvasServiceAction = async (
		service: { serviceId?: string; title: string; type: string },
		action: "start" | "stop" | "deploy",
	) => {
		const serviceId = service.serviceId;
		const idKey = SERVICE_ID_KEYS[service.type as ServiceKind];
		const actions = canvasActions[
			service.type as keyof typeof canvasActions
		] as unknown as
			| Record<
					"start" | "stop" | "deploy",
					{ mutateAsync: (input: Record<string, string>) => Promise<unknown> }
			  >
			| undefined;
		const mutation = actions?.[action];
		if (!serviceId || !idKey || !mutation) {
			toast.error("This service action is not available");
			return;
		}

		const labels = {
			deploy: { error: "deploying", loading: "Deploying", success: "deployed" },
			start: { error: "starting", loading: "Starting", success: "started" },
			stop: { error: "stopping", loading: "Stopping", success: "stopped" },
		};

		void toast.promise(
			mutation.mutateAsync({ [idKey]: serviceId }).then(async () => {
				await utils.project.all.invalidate();
				return `${service.title} ${labels[action].success} successfully`;
			}),
			{
				loading: `${labels[action].loading} ${service.title}...`,
				error: (error) =>
					`Error ${labels[action].error} ${service.title}: ${error instanceof Error ? error.message : "Unknown error"}`,
			},
		);
	};

	const handleDuplicateCanvasService = async (service: {
		serviceId?: string;
		title: string;
		type: string;
	}) => {
		if (!service.serviceId || !canvasEnvironment?.environmentId) return;
		const serviceType = service.type as ServiceKind;
		if (!SERVICE_ID_KEYS[serviceType]) return;

		void toast.promise(
			duplicateCanvasService({
				description: "",
				duplicateInSameProject: true,
				includeServices: true,
				name: "",
				selectedServices: [{ id: service.serviceId, type: serviceType }],
				sourceEnvironmentId: canvasEnvironment.environmentId,
			}).then(async () => {
				await utils.project.all.invalidate();
			}),
			{
				loading: `Duplicating ${service.title}...`,
				success: `${service.title} duplicated successfully`,
				error: (error) =>
					`Error duplicating ${service.title}: ${error instanceof Error ? error.message : "Unknown error"}`,
			},
		);
	};

	const handleDeleteCanvasService = async (service: {
		serviceId?: string;
		title: string;
		type: string;
	}) => {
		const serviceId = service.serviceId;
		const idKey = SERVICE_ID_KEYS[service.type as ServiceKind];
		const mutation = canvasDeleteActions[
			service.type as keyof typeof canvasDeleteActions
		] as unknown as
			| { mutateAsync: (input: Record<string, unknown>) => Promise<unknown> }
			| undefined;
		if (
			!serviceId ||
			!idKey ||
			!mutation ||
			!window.confirm(`Delete service "${service.title}"?`)
		) {
			return;
		}

		const input: Record<string, unknown> = { [idKey]: serviceId };
		if (service.type === "compose") input.deleteVolumes = false;

		void toast.promise(
			mutation.mutateAsync(input).then(async () => {
				await utils.project.all.invalidate();
			}),
			{
				loading: `Deleting ${service.title}...`,
				success: `${service.title} deleted successfully`,
				error: (error) =>
					`Error deleting ${service.title}: ${error instanceof Error ? error.message : "Unknown error"}`,
			},
		);
	};

	const deleteProject = async (projectId: string) => {
		await removeProject({ projectId })
			.then(() => toast.success("Project deleted successfully"))
			.catch(() => toast.error("Error deleting this project"))
			.finally(() => utils.project.all.invalidate());
	};

	return (
		<div className="-mx-4 -mb-4 min-h-screen bg-[#13111c] pr-0 text-white md:pr-2">
			<ProjectsRail />
			<div className="ml-0 min-h-screen min-w-0 md:ml-14">
				<ProjectsTopbar
					environmentName={canvasEnvironment?.name || "Select environment"}
					onSurfaceModeChange={handleSurfaceModeChange}
					projectName={canvasProject?.name || "Projects"}
					surfaceMode={surfaceMode}
				/>
				<main
					className={
						surfaceMode === "canvas"
							? "mx-2 mb-0 h-[calc(100vh-112px)] overflow-hidden bg-[#13111c] md:mx-0 md:mb-2 md:h-[calc(100vh-64px)]"
							: "mb-0 h-[calc(100vh-112px)] overflow-y-auto rounded-[8px] border border-white/[0.12] bg-[#13111c] md:mb-2 md:h-[calc(100vh-64px)]"
					}
				>
					{surfaceMode === "canvas" ? (
						<ProjectCanvas
							canDelete={permissions?.service.delete ?? false}
							canDeploy={permissions?.service.create ?? false}
							environmentName={canvasEnvironment?.name || "production"}
							environmentId={canvasEnvironment?.environmentId}
							onDeleteService={handleDeleteCanvasService}
							onDuplicateService={handleDuplicateCanvasService}
							onServiceAction={handleCanvasServiceAction}
							projectName={canvasProject?.name || "Project"}
							projectId={canvasProject?.projectId}
							services={canvasServices}
						/>
					) : (
						<div className="mx-auto w-full max-w-[1120px] space-y-8 px-5 pb-24 pt-12 sm:px-12 md:px-16">
							<div className="flex flex-wrap items-center gap-3">
								<h1 className="flex-1 text-[28px] font-normal leading-[38.5px]">
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
										<span className="hidden shrink-0 items-center gap-0.5 sm:flex">
											<kbd className="rounded border border-white/10 bg-white/5 px-1 font-sans text-xs leading-[18px] text-[#6c6b7b]">
												⌘
											</kbd>
											<kbd className="rounded border border-white/10 bg-white/5 px-1 font-sans text-xs leading-[18px] text-[#6c6b7b]">
												K
											</kbd>
										</span>
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
				<ProjectsBottomNav
					canvasHref={
						canvasProject
							? getProjectCanvasHref(canvasProject)
							: "/dashboard/projects"
					}
					surfaceMode={surfaceMode}
				/>
			</div>
		</div>
	);
};
