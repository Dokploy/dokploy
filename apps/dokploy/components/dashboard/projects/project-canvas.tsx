import copy from "copy-to-clipboard";
import {
	Archive,
	Atom,
	Ban,
	BarChart3,
	Boxes,
	Braces,
	CircuitBoard,
	Copy,
	Database,
	Grip,
	HardDrive,
	Layers3,
	Link2,
	Maximize2,
	Minus,
	Network,
	Play,
	Plus,
	Redo2,
	RotateCcw,
	Server,
	Settings,
	SlidersHorizontal,
	SquareTerminal,
	Trash2,
	Undo2,
	Unlink,
	Wrench,
	Zap,
} from "lucide-react";
import { useRouter } from "next/router";
import {
	type ComponentType,
	type PointerEvent,
	type ReactNode,
	useCallback,
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
import { AddAiAssistant } from "../project/add-ai-assistant";
import { AddApplication } from "../project/add-application";
import { AddCompose } from "../project/add-compose";
import { AddDatabase } from "../project/add-database";
import { AddImport } from "../project/add-import";
import { AddTemplate } from "../project/add-template";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	type PanelTab,
	RailwayServicePanel,
} from "../project/railway-service-panel";
import type { RailwayService } from "../project/railway-service-types";

export type CanvasService = {
	id: string;
	name: string;
	type: string;
	status?: string;
	icon?: string | null;
	appName?: string | null;
	description?: string | null;
	serverId?: string | null;
	serverIp?: string | null;
	serverName?: string | null;
	serverUsername?: string | null;
	createdAt?: string | null;
};

interface ProjectCanvasProps {
	canDelete?: boolean;
	canDeploy?: boolean;
	environmentId?: string;
	onDeleteService?: (node: CanvasNode) => void;
	onDuplicateService?: (node: CanvasNode) => void;
	onServiceAction?: (
		node: CanvasNode,
		action: "start" | "stop" | "deploy",
	) => void;
	projectName: string;
	projectId?: string;
	environmentName: string;
	services: CanvasService[];
}

type CanvasNode = {
	id: string;
	title: string;
	subtitle?: string;
	metric?: string;
	status?: string;
	volume?: string;
	type: string;
	icon?: string | null;
	serviceId?: string;
	appName?: string | null;
	description?: string | null;
	serverId?: string | null;
	serverIp?: string | null;
	serverName?: string | null;
	serverUsername?: string | null;
	createdAt?: string | null;
	left: number;
	top: number;
};

type CanvasPosition = {
	left: number;
	top: number;
};

type CanvasNodeRect = CanvasPosition & {
	height: number;
	width: number;
};

type CanvasEdge = {
	bidirectional?: boolean;
	id: string;
	kind: "network" | "variable";
	source: string;
	target: string;
};

type CanvasDragState = {
	id: string;
	startPositions: Record<string, CanvasPosition>;
	startPosition: CanvasPosition;
	startX: number;
	startY: number;
	startZoom: number;
};

type CanvasPanState = {
	originX: number;
	originY: number;
	startX: number;
	startY: number;
};

type CanvasHistoryEntry = {
	positions: Record<string, CanvasPosition>;
};

type IconComponent = ComponentType<{ className?: string }>;

const nodeIconMap: Record<string, IconComponent> = {
	application: Boxes,
	compose: CircuitBoard,
	postgres: PostgresqlIcon,
	mysql: MysqlIcon,
	mariadb: MariadbIcon,
	mongo: MongodbIcon,
	redis: RedisIcon,
	libsql: LibsqlIcon,
	bucket: Archive,
};

const nodeIconClassMap: Record<string, string> = {
	application: "text-[#35c5df]",
	compose: "text-[#a6e35e]",
	postgres: "text-[#7fb4d5]",
	mysql: "text-[#60a5fa]",
	mariadb: "text-[#a7c7e8]",
	mongo: "text-[#71d487]",
	redis: "text-[#f15c5c]",
	libsql: "text-[#83d6ff]",
	bucket: "text-[#d7d2e7]",
};

const isOnline = (status?: string) =>
	!status ||
	status.toLowerCase() === "online" ||
	status === "done" ||
	status === "running" ||
	status === "healthy";

const getPanelServiceStatus = (status?: string): RailwayService["status"] => {
	const normalizedStatus = status?.toLowerCase();
	if (normalizedStatus === "running" || normalizedStatus === "online") {
		return "running";
	}
	if (normalizedStatus === "done" || normalizedStatus === "healthy") {
		return "done";
	}
	if (normalizedStatus === "error" || normalizedStatus === "offline") {
		return "error";
	}
	return "idle";
};

const defaultNodeSlots: CanvasPosition[] = [
	{ left: 8, top: 38 },
	{ left: 38, top: 38 },
	{ left: 68, top: 20 },
	{ left: 68, top: 58 },
	{ left: 38, top: 12 },
	{ left: 8, top: 12 },
	{ left: 38, top: 68 },
	{ left: 8, top: 68 },
];

const getNodeInitialPosition = (
	index: number,
	total: number,
): CanvasPosition => {
	if (index < defaultNodeSlots.length && total <= defaultNodeSlots.length) {
		return defaultNodeSlots[index]!;
	}

	const cols = Math.max(3, Math.ceil(Math.sqrt(total * 1.5)));
	const col = index % cols;
	const row = Math.floor(index / cols);

	return {
		left: 6 + col * 30,
		top: 12 + row * 28,
	};
};

const buildNodes = (services: CanvasService[]): CanvasNode[] => {
	if (!services || services.length === 0) return [];

	return services.map((service, index) => {
		const position = getNodeInitialPosition(index, services.length);
		const normalizedType = service.type.toLowerCase();

		return {
			id: `${service.type}-${service.id}`,
			serviceId: service.id,
			title: service.name,
			subtitle: service.description || service.appName || service.type,
			status: isOnline(service.status) ? "Online" : "Offline",
			type: normalizedType,
			icon: service.icon,
			appName: service.appName,
			description: service.description,
			serverId: service.serverId,
			serverIp: service.serverIp,
			serverName: service.serverName,
			serverUsername: service.serverUsername,
			createdAt: service.createdAt,
			left: position.left,
			top: position.top,
		};
	});
};

const createPositionMap = (nodes: CanvasNode[]) =>
	Object.fromEntries(
		nodes.map((node) => [node.id, { left: node.left, top: node.top }]),
	) as Record<string, CanvasPosition>;

const isCanvasPosition = (value: unknown): value is CanvasPosition =>
	typeof value === "object" &&
	value !== null &&
	"left" in value &&
	"top" in value &&
	typeof value.left === "number" &&
	typeof value.top === "number" &&
	Number.isFinite(value.left) &&
	Number.isFinite(value.top);

const buildEdges = (nodes: CanvasNode[]): CanvasEdge[] => {
	const edges: CanvasEdge[] = [];
	const addEdge = (
		source: CanvasNode | undefined,
		target: CanvasNode | undefined,
		bidirectional = false,
		kind: CanvasEdge["kind"] = "network",
	) => {
		if (!source || !target || source.id === target.id) return;
		if (
			edges.some(
				(edge) =>
					(edge.source === source.id && edge.target === target.id) ||
					(edge.source === target.id && edge.target === source.id),
			)
		) {
			return;
		}
		edges.push({
			bidirectional,
			id: `${source.id}-${target.id}`,
			kind,
			source: source.id,
			target: target.id,
		});
	};

	const apps = nodes.filter(
		(node) => node.type === "application" || node.type === "compose",
	);
	const databases = nodes.filter((node) =>
		["postgres", "mysql", "mariadb", "mongo", "redis", "libsql"].includes(
			node.type,
		),
	);

	if (apps.length > 0 && databases.length > 0) {
		for (const app of apps) {
			for (const db of databases) {
				addEdge(app, db, false, "variable");
			}
		}
	} else if (apps.length > 1 && databases.length === 0) {
		for (let i = 1; i < apps.length; i++) {
			addEdge(apps[0], apps[i], true, "network");
		}
	}

	return edges;
};

const getOrthogonalPath = (source: CanvasNodeRect, target: CanvasNodeRect) => {
	const sourceCenter = {
		x: source.left + source.width / 2,
		y: source.top + source.height / 2,
	};
	const targetCenter = {
		x: target.left + target.width / 2,
		y: target.top + target.height / 2,
	};
	const deltaX = targetCenter.x - sourceCenter.x;
	const deltaY = targetCenter.y - sourceCenter.y;

	if (Math.abs(deltaX) >= Math.abs(deltaY)) {
		const from =
			deltaX >= 0
				? { x: source.left + source.width, y: sourceCenter.y }
				: { x: source.left, y: sourceCenter.y };
		const to =
			deltaX >= 0
				? { x: target.left, y: targetCenter.y }
				: { x: target.left + target.width, y: targetCenter.y };
		const middleX = from.x + (to.x - from.x) / 2;
		return `M ${from.x} ${from.y} H ${middleX} V ${to.y} H ${to.x}`;
	}

	const from =
		deltaY >= 0
			? { x: sourceCenter.x, y: source.top + source.height }
			: { x: sourceCenter.x, y: source.top };
	const to =
		deltaY >= 0
			? { x: targetCenter.x, y: target.top }
			: { x: targetCenter.x, y: target.top + target.height };
	const middleY = from.y + (to.y - from.y) / 2;
	return `M ${from.x} ${from.y} V ${middleY} H ${to.x} V ${to.y}`;
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), Math.max(min, max));

const CANVAS_GRID_SIZE = 24;
// Railway anchors the node wrapper on a grid dot; the visible card begins after
// its 1px border. Keep the same offset so the dot sits on the card corner.
const CANVAS_NODE_GRID_OFFSET = 1;
const CANVAS_MIN_ZOOM = 0.7;
const CANVAS_MAX_ZOOM = 1.25;
const CANVAS_ZOOM_STEP = 0.1;
// React Flow/Railway's default scroll-pan multiplier.
const CANVAS_PAN_SPEED = 0.5;
const CANVAS_MAX_PAN_SPEED = 2109.01;
const CANVAS_PINCH_ZOOM_RATE = 6.2935;
const CANVAS_PINCH_ZOOM_MULTIPLIER = 15;
const CANVAS_PINCH_ZOOM_SPEED =
	(Math.log1p(CANVAS_PINCH_ZOOM_RATE) / 1000) * CANVAS_PINCH_ZOOM_MULTIPLIER;

const PANEL_SERVICE_TYPES = [
	"application",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
] as const;

const isPanelServiceType = (
	type: string,
): type is (typeof PANEL_SERVICE_TYPES)[number] =>
	PANEL_SERVICE_TYPES.includes(type as (typeof PANEL_SERVICE_TYPES)[number]);

const PANEL_TAB_VALUES: PanelTab[] = [
	"deployments",
	"variables",
	"metrics",
	"console",
	"settings",
];

const isPanelTab = (value: string): value is PanelTab =>
	PANEL_TAB_VALUES.includes(value as PanelTab);

const isCanvasViewport = (
	value: unknown,
): value is { x: number; y: number; zoom: number } =>
	typeof value === "object" &&
	value !== null &&
	"x" in value &&
	"y" in value &&
	"zoom" in value &&
	typeof value.x === "number" &&
	typeof value.y === "number" &&
	typeof value.zoom === "number" &&
	Number.isFinite(value.x) &&
	Number.isFinite(value.y) &&
	Number.isFinite(value.zoom) &&
	value.zoom >= CANVAS_MIN_ZOOM &&
	value.zoom <= CANVAS_MAX_ZOOM;

const snapCanvasPosition = (
	position: CanvasPosition,
	layer: HTMLDivElement,
) => {
	const width = layer.clientWidth;
	const height = layer.clientHeight;
	if (width === 0 || height === 0) return position;

	const snapToNodeGrid = (value: number) =>
		Math.round((value - CANVAS_NODE_GRID_OFFSET) / CANVAS_GRID_SIZE) *
			CANVAS_GRID_SIZE +
		CANVAS_NODE_GRID_OFFSET;
	const snappedLeft = snapToNodeGrid((position.left / 100) * width);
	const snappedTop = snapToNodeGrid((position.top / 100) * height);

	return {
		left: (snappedLeft / width) * 100,
		top: (snappedTop / height) * 100,
	};
};

const canvasPositionFromPixels = (
	x: number,
	y: number,
	layer: HTMLDivElement,
) =>
	snapCanvasPosition(
		{
			left: (x / layer.clientWidth) * 100,
			top: (y / layer.clientHeight) * 100,
		},
		layer,
	);

interface CanvasNodeCardProps {
	canDelete: boolean;
	canDeploy: boolean;
	dragging: boolean;
	grouped: boolean;
	onAction: (action: "start" | "stop" | "deploy") => void;
	onDuplicate: () => void;
	onGroupToggle: () => void;
	onOpenService: (tab?: string) => void;
	node: CanvasNode;
	nodeRef: (element: HTMLButtonElement | null) => void;
	onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
	onDelete: () => void;
	position: CanvasPosition;
	selected: boolean;
	onSelect: () => void;
}

const CanvasNodeCard = ({
	canDelete,
	canDeploy,
	dragging,
	grouped,
	onAction,
	onDuplicate,
	onGroupToggle,
	onOpenService,
	node,
	nodeRef,
	onPointerDown,
	onDelete,
	position,
	selected,
	onSelect,
}: CanvasNodeCardProps) => {
	const Icon = nodeIconMap[node.type] ?? Server;
	const iconClass = nodeIconClassMap[node.type] ?? "text-[#d7d2e7]";
	const nodeIsOnline = isOnline(node.status);
	const minHeightClass = "min-h-[144px]";
	const contextMenuItemClass =
		"min-h-9 gap-2.5 rounded-md px-2.5 text-sm font-normal text-[#a7a2b3] focus:bg-white/[0.07] focus:text-white";

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					aria-pressed={selected}
					aria-label={`Select ${node.title}`}
					aria-grabbed={dragging}
					className={`absolute flex ${minHeightClass} w-[288px] touch-none select-none flex-col overflow-hidden rounded-2xl border bg-[#1c1a27]/95 text-left shadow-[0_12px_34px_rgba(0,0,0,0.16)] transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a667e4] ${dragging ? "cursor-grabbing" : "cursor-pointer"} ${selected ? "border-[#a667e4]/80 shadow-[0_0_0_2px_rgba(166,103,228,0.2),0_12px_34px_rgba(0,0,0,0.22)]" : "border-white/[0.14] hover:border-white/[0.25] hover:bg-[#211f2d] hover:shadow-[0_12px_34px_rgba(0,0,0,0.22)]"}`}
					onClick={onSelect}
					onPointerDown={onPointerDown}
					ref={nodeRef}
					style={{ left: `${position.left}%`, top: `${position.top}%` }}
					type="button"
				>
					<div className="flex items-start gap-4 px-6 pb-0 pt-6 lg:px-8 lg:pb-0 lg:pt-7">
						<div className={`mt-0.5 shrink-0 ${iconClass}`}>
							{node.icon ? (
								<img alt="" className="size-6 object-contain" src={node.icon} />
							) : (
								<Icon className="size-6" />
							)}
						</div>
						<div className="min-w-0">
							<div className="truncate text-base font-semibold tracking-[-0.01em] text-white">
								{node.title}
							</div>
							{node.subtitle && (
								<div className="truncate text-sm text-[#9a96a9]">
									{node.subtitle}
								</div>
							)}
						</div>
					</div>

					{node.serverName && (
						<div className="px-6 pt-2 text-xs text-[#7e7a8d] lg:px-8">
							{node.serverName}
						</div>
					)}

					{node.status && (
						<div className="mt-auto flex items-center gap-3 px-6 pb-5 text-sm lg:px-8 lg:pb-6 lg:text-base">
							<span
								className={`flex size-2.5 items-center justify-center rounded-full ${nodeIsOnline ? "bg-[#1e765e]/40" : "bg-[#95623c]/40"}`}
							>
								<span
									className={`size-1.5 rounded-full ${nodeIsOnline ? "bg-[#41bb8d]" : "bg-[#d99a52]"}`}
								/>
							</span>
							<span
								className={nodeIsOnline ? "text-[#55bd95]" : "text-[#dda15f]"}
							>
								{node.status}
							</span>
						</div>
					)}
				</button>
			</ContextMenuTrigger>

			<ContextMenuContent className="w-[260px] rounded-lg border border-[#33323e] bg-[#181622]/95 p-1.5 text-[#a7a2b3] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
				<ContextMenuSub>
					<ContextMenuSubTrigger className={contextMenuItemClass}>
						<Boxes className="size-4" strokeWidth={1.7} />
						<span>Group</span>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-[220px] rounded-lg border border-[#33323e] bg-[#181622]/95 p-1.5 text-[#a7a2b3] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
						<ContextMenuItem
							className={contextMenuItemClass}
							onSelect={onGroupToggle}
						>
							<Boxes className="size-4" strokeWidth={1.7} />
							<span>{grouped ? "Remove from group" : "Select for group"}</span>
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuItem
					className={contextMenuItemClass}
					onSelect={() => {
						const target = node.serverIp || node.serverName || "localhost";
						const username = node.serverUsername || "root";
						copy(`ssh ${username}@${target}`);
						toast.success("SSH command copied");
					}}
				>
					<SquareTerminal className="size-4" strokeWidth={1.7} />
					<span>Copy SSH Command</span>
				</ContextMenuItem>
				<ContextMenuItem
					className={contextMenuItemClass}
					disabled={!node.serviceId}
					onSelect={() => onOpenService("advanced")}
				>
					<HardDrive className="size-4" strokeWidth={1.7} />
					<span>Attach volume</span>
				</ContextMenuItem>
				{canDeploy && (
					<ContextMenuSub>
						<ContextMenuSubTrigger className={contextMenuItemClass}>
							<SlidersHorizontal className="size-4" strokeWidth={1.7} />
							<span>Config</span>
						</ContextMenuSubTrigger>
						<ContextMenuSubContent className="w-[180px] rounded-lg border border-[#33323e] bg-[#181622]/95 p-1.5 text-[#a7a2b3] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
							<ContextMenuItem
								className={contextMenuItemClass}
								onSelect={() => onAction("start")}
							>
								<Play className="size-4" strokeWidth={1.7} />
								<span>Start</span>
							</ContextMenuItem>
							<ContextMenuItem
								className={contextMenuItemClass}
								onSelect={() => onAction("stop")}
							>
								<Ban className="size-4" strokeWidth={1.7} />
								<span>Stop</span>
							</ContextMenuItem>
						</ContextMenuSubContent>
					</ContextMenuSub>
				)}
				{canDeploy && <ContextMenuSeparator className="my-1 bg-white/[0.09]" />}
				{canDeploy && (
					<ContextMenuItem
						className={contextMenuItemClass}
						onSelect={() => onAction("deploy")}
					>
						<Zap className="size-4" strokeWidth={1.7} />
						<span>Latest deploy</span>
					</ContextMenuItem>
				)}
				<ContextMenuItem
					className={contextMenuItemClass}
					disabled={!node.serviceId}
					onSelect={() => onOpenService("environment")}
				>
					<Braces className="size-4" strokeWidth={1.7} />
					<span>View Variables</span>
				</ContextMenuItem>
				<ContextMenuItem
					className={contextMenuItemClass}
					disabled={!node.serviceId}
					onSelect={() => onOpenService("monitoring")}
				>
					<BarChart3 className="size-4" strokeWidth={1.7} />
					<span>View Metrics</span>
				</ContextMenuItem>
				<ContextMenuItem
					className={contextMenuItemClass}
					disabled={!node.serviceId}
					onSelect={() => onOpenService("general")}
				>
					<Settings className="size-4" strokeWidth={1.7} />
					<span>View Settings</span>
				</ContextMenuItem>
				<ContextMenuSeparator className="my-1 bg-white/[0.09]" />
				<ContextMenuItem
					className={contextMenuItemClass}
					disabled={!node.serviceId}
					onSelect={onDuplicate}
				>
					<Copy className="size-4" strokeWidth={1.7} />
					<span>Duplicate</span>
				</ContextMenuItem>
				{canDelete && (
					<>
						<ContextMenuSeparator className="my-1 bg-white/[0.09]" />
						<ContextMenuItem
							className={`${contextMenuItemClass} text-red-500 focus:bg-red-500/10 focus:text-red-400`}
							disabled={!node.serviceId}
							onSelect={onDelete}
						>
							<Trash2 className="size-4" strokeWidth={1.7} />
							<span>Delete Service</span>
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
};

interface CanvasControlProps {
	"aria-label": string;
	children: ReactNode;
	disabled?: boolean;
	grouped?: boolean;
	onClick: () => void;
}

const CanvasControl = ({
	children,
	disabled,
	grouped,
	onClick,
	...props
}: CanvasControlProps) => (
	<button
		{...props}
		className={`flex items-center justify-center text-[#a7a2b3] transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${grouped ? "size-[34px] rounded-md border border-transparent" : "size-9 rounded-md border border-[#33323e] bg-[#181622]/95"}`}
		disabled={disabled}
		onClick={onClick}
		type="button"
	>
		{children}
	</button>
);

export const ProjectCanvas = ({
	canDelete = true,
	canDeploy = true,
	environmentId,
	onDeleteService,
	onDuplicateService,
	onServiceAction,
	projectName,
	projectId,
	environmentName,
	services,
}: ProjectCanvasProps) => {
	const router = useRouter();
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [showGrid, setShowGrid] = useState(true);
	const [showConnections, setShowConnections] = useState(true);
	const [showNetworkTraffic, setShowNetworkTraffic] = useState(true);
	const [showVariableReferences, setShowVariableReferences] = useState(true);
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [activePanelServiceId, setActivePanelServiceId] = useState<
		string | null
	>(null);
	const [activePanelTab, setActivePanelTab] = useState<PanelTab>("deployments");
	const [isAddOpen, setIsAddOpen] = useState(false);
	const nodes = useMemo(() => buildNodes(services), [services]);
	const edges = useMemo(() => buildEdges(nodes), [nodes]);
	const activePanelNode = useMemo(
		() =>
			nodes.find(
				(node) =>
					(node.serviceId ?? node.id) === activePanelServiceId &&
					isPanelServiceType(node.type),
			) ?? null,
		[activePanelServiceId, nodes],
	);
	const activePanelService = useMemo<RailwayService | null>(() => {
		if (!activePanelNode) return null;

		return {
			createdAt: activePanelNode.createdAt || new Date().toISOString(),
			description: activePanelNode.description || activePanelNode.subtitle,
			icon: activePanelNode.icon,
			id: activePanelNode.serviceId ?? activePanelNode.id,
			name: activePanelNode.title,
			appName: activePanelNode.appName,
			serverId: activePanelNode.serverId,
			serverIp: activePanelNode.serverIp,
			serverName: activePanelNode.serverName,
			serverUsername: activePanelNode.serverUsername,
			status: getPanelServiceStatus(activePanelNode.status),
			type: activePanelNode.type as RailwayService["type"],
		};
	}, [activePanelNode]);

	useEffect(() => {
		if (!router.isReady) return;

		const serviceId =
			typeof router.query.serviceId === "string"
				? router.query.serviceId
				: null;
		const queryTab =
			typeof router.query.tab === "string" && isPanelTab(router.query.tab)
				? router.query.tab
				: "deployments";

		setActivePanelServiceId(serviceId);
		setActivePanelTab(queryTab);
	}, [router.isReady, router.query.serviceId, router.query.tab]);

	const openServicePanel = useCallback(
		(serviceId: string, tab: PanelTab = "deployments") => {
			setActivePanelServiceId(serviceId);
			setActivePanelTab(tab);
			if (!router.isReady) return;

			void router.replace(
				{
					pathname: router.pathname,
					query: { ...router.query, serviceId, tab },
				},
				undefined,
				{ shallow: true },
			);
		},
		[router],
	);

	const closeServicePanel = useCallback(() => {
		setActivePanelServiceId(null);
		if (!router.isReady) return;

		const query = { ...router.query };
		delete query.serviceId;
		delete query.tab;
		void router.replace({ pathname: router.pathname, query }, undefined, {
			shallow: true,
		});
	}, [router]);

	const handlePanelTabChange = useCallback(
		(tab: PanelTab) => {
			setActivePanelTab(tab);
			if (!activePanelServiceId || !router.isReady) return;

			void router.replace(
				{
					pathname: router.pathname,
					query: { ...router.query, serviceId: activePanelServiceId, tab },
				},
				undefined,
				{ shallow: true },
			);
		},
		[activePanelServiceId, router],
	);
	const storageKey = useMemo(
		() =>
			`dokploy-project-canvas:v4:${encodeURIComponent(projectName)}:${encodeURIComponent(environmentName)}`,
		[environmentName, projectName],
	);
	const initialPositions = useMemo(() => createPositionMap(nodes), [nodes]);
	const [nodePositions, setNodePositions] =
		useState<Record<string, CanvasPosition>>(initialPositions);
	const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(
		null,
	);
	const [dragState, setDragState] = useState<CanvasDragState | null>(null);
	const [nodeRects, setNodeRects] = useState<Record<string, CanvasNodeRect>>(
		{},
	);
	const [canvasSize, setCanvasSize] = useState({ height: 1, width: 1 });
	const [panState, setPanState] = useState<CanvasPanState | null>(null);
	const [history, setHistory] = useState<CanvasHistoryEntry[]>([]);
	const [redoHistory, setRedoHistory] = useState<CanvasHistoryEntry[]>([]);
	const canvasRef = useRef<HTMLDivElement>(null);
	const nodeLayerRef = useRef<HTMLDivElement>(null);
	const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const dragMovedRef = useRef(false);
	const panTimestampRef = useRef<number | null>(null);
	const pinchTimestampRef = useRef<number | null>(null);

	const getServiceHref = useCallback(
		(node: CanvasNode, tab?: string) => {
			if (!projectId || !environmentId || !node.serviceId) return null;
			if (
				node.type !== "application" &&
				node.type !== "compose" &&
				node.type !== "libsql" &&
				node.type !== "mariadb" &&
				node.type !== "mongo" &&
				node.type !== "mysql" &&
				node.type !== "postgres" &&
				node.type !== "redis"
			) {
				return null;
			}
			const href = `/dashboard/project/${projectId}/environment/${environmentId}/services/${node.type}/${node.serviceId}`;
			return tab ? `${href}?tab=${tab}` : href;
		},
		[environmentId, projectId],
	);

	const openService = useCallback(
		(node: CanvasNode, tab?: string) => {
			const href = getServiceHref(node, tab);
			if (href) {
				void router.push(href);
				return;
			}
			toast.info("This action is available for deployed services only");
		},
		[getServiceHref, router],
	);

	const toggleNodeGroup = useCallback((nodeId: string) => {
		setSelectedNode((currentNode) => (currentNode === nodeId ? null : nodeId));
	}, []);

	const toggleAllConnections = useCallback(() => {
		setShowConnections((currentValue) => {
			const nextValue = !currentValue;
			if (nextValue) {
				setShowNetworkTraffic(true);
				setShowVariableReferences(true);
			}
			return nextValue;
		});
	}, []);

	const getSnappedPositions = useCallback(
		(positions: Record<string, CanvasPosition>) => {
			const layer = nodeLayerRef.current;
			if (!layer) return positions;

			let changed = false;
			const nextPositions = Object.fromEntries(
				nodes.map((node) => {
					const currentPosition =
						positions[node.id] ??
						({ left: node.left, top: node.top } satisfies CanvasPosition);
					const nextPosition = snapCanvasPosition(currentPosition, layer);
					if (
						nextPosition.left !== currentPosition.left ||
						nextPosition.top !== currentPosition.top
					) {
						changed = true;
					}
					return [node.id, nextPosition];
				}),
			) as Record<string, CanvasPosition>;

			return changed ? nextPositions : positions;
		},
		[nodes],
	);

	useEffect(() => {
		let storedPositions: Record<string, CanvasPosition> = {};
		let storedViewport: { x: number; y: number; zoom: number } | null = null;
		if (typeof window !== "undefined") {
			try {
				const storedValue = window.localStorage.getItem(storageKey);
				if (storedValue) {
					const parsed = JSON.parse(storedValue) as Record<string, unknown>;
					const storedPositionSource =
						parsed.positions && typeof parsed.positions === "object"
							? parsed.positions
							: parsed;
					storedPositions = Object.fromEntries(
						Object.entries(storedPositionSource).filter(([, value]) =>
							isCanvasPosition(value),
						),
					) as Record<string, CanvasPosition>;
					storedViewport = isCanvasViewport(parsed.viewport)
						? parsed.viewport
						: null;
				}
			} catch {
				storedPositions = {};
			}
		}

		setNodePositions(
			(currentPositions) =>
				Object.fromEntries(
					nodes.map((node) => [
						node.id,
						storedPositions[node.id] ??
							currentPositions[node.id] ?? {
								left: node.left,
								top: node.top,
							},
					]),
				) as Record<string, CanvasPosition>,
		);
		if (storedViewport) {
			setPan({ x: storedViewport.x, y: storedViewport.y });
			setZoom(storedViewport.zoom);
		}
		setHistory([]);
		setRedoHistory([]);
		setHydratedStorageKey(storageKey);
	}, [nodes, storageKey]);

	useEffect(() => {
		if (hydratedStorageKey !== storageKey || typeof window === "undefined") {
			return;
		}
		try {
			window.localStorage.setItem(
				storageKey,
				JSON.stringify({
					positions: nodePositions,
					viewport: { ...pan, zoom },
				}),
			);
		} catch {
			// Local storage can be unavailable in private or restricted contexts.
		}
	}, [hydratedStorageKey, nodePositions, pan, storageKey, zoom]);

	const measureLayout = useCallback(() => {
		const layer = nodeLayerRef.current;
		if (!layer) return;

		const nextRects: Record<string, CanvasNodeRect> = {};
		for (const node of nodes) {
			const element = nodeRefs.current[node.id];
			if (!element) continue;
			nextRects[node.id] = {
				left: element.offsetLeft,
				top: element.offsetTop,
				width: element.offsetWidth,
				height: element.offsetHeight,
			};
		}

		const nextSize = { width: layer.clientWidth, height: layer.clientHeight };
		setCanvasSize((currentSize) =>
			currentSize.width === nextSize.width &&
			currentSize.height === nextSize.height
				? currentSize
				: nextSize,
		);
		setNodeRects((currentRects) => {
			const currentIds = Object.keys(currentRects);
			const nextIds = Object.keys(nextRects);
			if (
				currentIds.length === nextIds.length &&
				nextIds.every((id) => {
					const current = currentRects[id];
					const next = nextRects[id];
					if (!current || !next) return false;
					return (
						current.left === next.left &&
						current.top === next.top &&
						current.width === next.width &&
						current.height === next.height
					);
				})
			) {
				return currentRects;
			}
			return nextRects;
		});
		setNodePositions((currentPositions) =>
			getSnappedPositions(currentPositions),
		);
	}, [getSnappedPositions, nodes]);

	useEffect(() => {
		measureLayout();
	}, [measureLayout, nodePositions]);

	useEffect(() => {
		const layer = nodeLayerRef.current;
		const observer =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(measureLayout)
				: null;
		if (layer) observer?.observe(layer);
		window.addEventListener("resize", measureLayout);
		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", measureLayout);
		};
	}, [measureLayout]);

	const handleNodePointerDown = useCallback(
		(event: PointerEvent<HTMLButtonElement>, node: CanvasNode) => {
			if (event.button !== 0) return;
			event.preventDefault();
			event.stopPropagation();
			try {
				event.currentTarget.setPointerCapture(event.pointerId);
			} catch {
				// Pointer capture is not available in every embedded browser surface.
			}
			dragMovedRef.current = false;
			const layer = nodeLayerRef.current;
			const fallbackPosition = nodePositions[node.id] ?? {
				left: node.left,
				top: node.top,
			};
			setDragState({
				id: node.id,
				startPositions: nodePositions,
				startPosition: layer
					? snapCanvasPosition(fallbackPosition, layer)
					: fallbackPosition,
				startX: event.clientX,
				startY: event.clientY,
				startZoom: zoom,
			});
		},
		[nodePositions, zoom],
	);

	useEffect(() => {
		if (!dragState) return;

		const handlePointerMove = (event: globalThis.PointerEvent) => {
			const layer = nodeLayerRef.current;
			if (!layer || layer.clientWidth === 0 || layer.clientHeight === 0) return;
			event.preventDefault();
			const deltaLeft =
				((event.clientX - dragState.startX) /
					dragState.startZoom /
					layer.clientWidth) *
				100;
			const deltaTop =
				((event.clientY - dragState.startY) /
					dragState.startZoom /
					layer.clientHeight) *
				100;
			if (Math.abs(deltaLeft) > 0.2 || Math.abs(deltaTop) > 0.2) {
				dragMovedRef.current = true;
			}

			const nextPosition = snapCanvasPosition(
				{
					left: dragState.startPosition.left + deltaLeft,
					top: dragState.startPosition.top + deltaTop,
				},
				layer,
			);
			setNodePositions((currentPositions) => ({
				...currentPositions,
				[dragState.id]: nextPosition,
			}));
		};
		const stopDragging = () => {
			if (dragMovedRef.current) {
				setHistory((currentHistory) =>
					[...currentHistory, { positions: dragState.startPositions }].slice(
						-50,
					),
				);
				setRedoHistory([]);
			}
			setDragState(null);
		};

		window.addEventListener("pointermove", handlePointerMove, {
			passive: false,
		});
		window.addEventListener("pointerup", stopDragging);
		window.addEventListener("pointercancel", stopDragging);
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", stopDragging);
			window.removeEventListener("pointercancel", stopDragging);
		};
	}, [dragState]);

	const handleCanvasPointerDown = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) return;
			const target = event.target as HTMLElement;
			if (target.closest("button")) return;

			event.preventDefault();
			try {
				event.currentTarget.setPointerCapture(event.pointerId);
			} catch {
				// Pointer capture is not available in every embedded browser surface.
			}
			setPanState({
				originX: pan.x,
				originY: pan.y,
				startX: event.clientX,
				startY: event.clientY,
			});
		},
		[pan.x, pan.y],
	);

	const handleCanvasPointerMove = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (!panState || event.buttons === 0) return;
			event.preventDefault();
			setPan({
				x: panState.originX + event.clientX - panState.startX,
				y: panState.originY + event.clientY - panState.startY,
			});
		},
		[panState],
	);

	const stopCanvasPan = useCallback(
		(event?: PointerEvent<HTMLDivElement>) => {
			if (!panState) return;
			if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
			setPanState(null);
		},
		[panState],
	);

	const zoomAtPoint = useCallback(
		(clientX: number, clientY: number, nextZoom: number) => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			const pointerX = clientX - rect.left;
			const pointerY = clientY - rect.top;
			const worldX = (pointerX - pan.x) / zoom;
			const worldY = (pointerY - pan.y) / zoom;

			setZoom(nextZoom);
			setPan({
				x: pointerX - worldX * nextZoom,
				y: pointerY - worldY * nextZoom,
			});
		},
		[pan.x, pan.y, zoom],
	);

	const handleCanvasWheel = useCallback(
		(event: globalThis.WheelEvent) => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			event.preventDefault();
			const deltaMultiplier =
				event.deltaMode === 1
					? 16
					: event.deltaMode === 2
						? canvas.clientHeight
						: 1;
			const deltaX = event.deltaX * deltaMultiplier * CANVAS_PAN_SPEED;
			const deltaY = event.deltaY * deltaMultiplier * CANVAS_PAN_SPEED;
			if (event.ctrlKey || event.metaKey) {
				panTimestampRef.current = null;
				const rect = canvas.getBoundingClientRect();
				const now = performance.now();
				const previousTimestamp = pinchTimestampRef.current;
				const elapsedSeconds = previousTimestamp
					? Math.min(0.05, Math.max(1 / 240, (now - previousTimestamp) / 1000))
					: 1 / 60;
				pinchTimestampRef.current = now;
				const requestedLogDelta = -deltaY * CANVAS_PINCH_ZOOM_SPEED;
				const maximumLogDelta =
					Math.log1p(CANVAS_PINCH_ZOOM_RATE * elapsedSeconds) *
					CANVAS_PINCH_ZOOM_MULTIPLIER;
				const logDelta =
					Math.sign(requestedLogDelta) *
					Math.min(Math.abs(requestedLogDelta), maximumLogDelta);
				const nextZoom = clamp(
					zoom * Math.exp(logDelta),
					CANVAS_MIN_ZOOM,
					CANVAS_MAX_ZOOM,
				);
				if (nextZoom !== zoom) {
					zoomAtPoint(event.clientX, event.clientY, nextZoom);
				}
				return;
			}

			pinchTimestampRef.current = null;
			if (deltaX === 0 && deltaY === 0) return;
			const now = performance.now();
			const previousTimestamp = panTimestampRef.current;
			const elapsedSeconds = previousTimestamp
				? Math.min(0.05, Math.max(1 / 240, (now - previousTimestamp) / 1000))
				: 1 / 60;
			panTimestampRef.current = now;
			const requestedDistance = Math.hypot(deltaX, deltaY);
			const maximumDistance = CANVAS_MAX_PAN_SPEED * elapsedSeconds;
			const panScale =
				requestedDistance > maximumDistance
					? maximumDistance / requestedDistance
					: 1;
			setPan((currentPan) => ({
				x: currentPan.x - deltaX * panScale,
				y: currentPan.y - deltaY * panScale,
			}));
		},
		[zoom, zoomAtPoint],
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const wheelOptions: AddEventListenerOptions = {
			capture: true,
			passive: false,
		};
		canvas.addEventListener("wheel", handleCanvasWheel, wheelOptions);
		return () => canvas.removeEventListener("wheel", handleCanvasWheel, true);
	}, [handleCanvasWheel]);

	const zoomAtCenter = useCallback(
		(direction: "in" | "out") => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			const factor =
				direction === "in" ? 1 + CANVAS_ZOOM_STEP : 1 - CANVAS_ZOOM_STEP;
			zoomAtPoint(
				rect.left + rect.width / 2,
				rect.top + rect.height / 2,
				clamp(zoom * factor, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM),
			);
		},
		[zoom, zoomAtPoint],
	);

	const handleUndo = useCallback(() => {
		const previous = history.at(-1);
		if (!previous) return;
		setHistory((currentHistory) => currentHistory.slice(0, -1));
		setRedoHistory((currentHistory) => [
			...currentHistory,
			{ positions: nodePositions },
		]);
		setNodePositions(previous.positions);
	}, [history, nodePositions]);

	const handleRedo = useCallback(() => {
		const next = redoHistory.at(-1);
		if (!next) return;
		setRedoHistory((currentHistory) => currentHistory.slice(0, -1));
		setHistory((currentHistory) => [
			...currentHistory,
			{ positions: nodePositions },
		]);
		setNodePositions(next.positions);
	}, [nodePositions, redoHistory]);

	const rememberCurrentPositions = useCallback(() => {
		setHistory((currentHistory) =>
			[...currentHistory, { positions: nodePositions }].slice(-50),
		);
		setRedoHistory([]);
	}, [nodePositions]);

	const handleAutoLayout = useCallback(() => {
		const layer = nodeLayerRef.current;
		if (
			!layer ||
			layer.clientWidth === 0 ||
			layer.clientHeight === 0 ||
			nodes.length === 0
		) {
			return;
		}

		const sizes = new Map(
			nodes.map((node) => {
				const element = nodeRefs.current[node.id];
				return [
					node.id,
					{
						height: element?.offsetHeight ?? 1,
						width: element?.offsetWidth ?? 1,
					},
				] as const;
			}),
		);
		const getNodeSize = (node: CanvasNode) =>
			sizes.get(node.id) ?? { height: 1, width: 1 };
		const gap = CANVAS_GRID_SIZE * 2;
		const snapPixels = (value: number) =>
			Math.round(value / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
		const coreNodeIds = new Set(
			edges
				.filter((edge) => edge.bidirectional)
				.flatMap((edge) => [edge.source, edge.target]),
		);
		const coreNodes = nodes.filter((node) => coreNodeIds.has(node.id));
		const primaryNode =
			coreNodes.find((node) =>
				edges.some(
					(edge) => edge.source === node.id && !coreNodeIds.has(edge.target),
				),
			) ??
			coreNodes.at(-1) ??
			nodes[0];
		const branchNodes = primaryNode
			? nodes.filter(
					(node) =>
						!coreNodeIds.has(node.id) &&
						edges.some(
							(edge) =>
								(edge.source === primaryNode.id && edge.target === node.id) ||
								(edge.target === primaryNode.id && edge.source === node.id),
						),
				)
			: [];
		const branchNodeIds = new Set(branchNodes.map((node) => node.id));
		const extraNodes = nodes.filter(
			(node) => !coreNodeIds.has(node.id) && !branchNodeIds.has(node.id),
		);
		const coreWidth =
			coreNodes.reduce((total, node) => total + getNodeSize(node).width, 0) +
			Math.max(0, coreNodes.length - 1) * gap;
		const coreHeight = Math.max(
			1,
			...coreNodes.map((node) => getNodeSize(node).height),
		);
		const branchHeight =
			branchNodes.reduce((total, node) => total + getNodeSize(node).height, 0) +
			Math.max(0, branchNodes.length - 1) * gap;
		const layoutWidth =
			coreWidth +
			(branchNodes.length > 0 ? gap : 0) +
			(branchNodes.length > 0
				? Math.max(...branchNodes.map((node) => getNodeSize(node).width))
				: 0);
		const layoutHeight = Math.max(coreHeight, branchHeight, 1);
		const startX = snapPixels((layer.clientWidth - layoutWidth) / 2);
		const startY = snapPixels((layer.clientHeight - layoutHeight) / 2);
		const nextPositions: Record<string, CanvasPosition> = {};

		let coreX = startX;
		const coreY = startY + (layoutHeight - coreHeight) / 2;
		for (const node of coreNodes) {
			const size = getNodeSize(node);
			nextPositions[node.id] = canvasPositionFromPixels(coreX, coreY, layer);
			coreX += size.width + gap;
		}

		const branchX = startX + coreWidth + (branchNodes.length > 0 ? gap : 0);
		let branchY = startY + (layoutHeight - branchHeight) / 2;
		for (const node of branchNodes) {
			const size = getNodeSize(node);
			nextPositions[node.id] = canvasPositionFromPixels(
				branchX,
				branchY,
				layer,
			);
			branchY += size.height + gap;
		}

		const extraColumns = Math.max(1, Math.ceil(Math.sqrt(extraNodes.length)));
		for (const [index, node] of extraNodes.entries()) {
			const size = getNodeSize(node);
			const column = index % extraColumns;
			const row = Math.floor(index / extraColumns);
			nextPositions[node.id] = canvasPositionFromPixels(
				startX + column * (size.width + gap),
				startY + layoutHeight + gap + row * (size.height + gap),
				layer,
			);
		}

		const layoutBounds = nodes.reduce(
			(bounds, node) => {
				const position = nextPositions[node.id] ?? {
					left: node.left,
					top: node.top,
				};
				const size = getNodeSize(node);
				const left = (position.left / 100) * layer.clientWidth;
				const top = (position.top / 100) * layer.clientHeight;
				return {
					bottom: Math.max(bounds.bottom, top + size.height),
					left: Math.min(bounds.left, left),
					right: Math.max(bounds.right, left + size.width),
					top: Math.min(bounds.top, top),
				};
			},
			{
				bottom: Number.NEGATIVE_INFINITY,
				left: Number.POSITIVE_INFINITY,
				right: Number.NEGATIVE_INFINITY,
				top: Number.POSITIVE_INFINITY,
			},
		);
		const fitPadding = CANVAS_GRID_SIZE * 2;
		const contentWidth = Math.max(layoutBounds.right - layoutBounds.left, 1);
		const contentHeight = Math.max(layoutBounds.bottom - layoutBounds.top, 1);
		const fitZoom = clamp(
			Math.min(
				(layer.clientWidth - fitPadding * 2) / contentWidth,
				(layer.clientHeight - fitPadding * 2) / contentHeight,
			),
			CANVAS_MIN_ZOOM,
			CANVAS_MAX_ZOOM,
		);
		const contentCenterX = (layoutBounds.left + layoutBounds.right) / 2;
		const contentCenterY = (layoutBounds.top + layoutBounds.bottom) / 2;
		const fitPan = {
			x: layer.clientWidth / 2 - contentCenterX * fitZoom,
			y: layer.clientHeight / 2 - contentCenterY * fitZoom,
		};

		rememberCurrentPositions();
		setNodePositions(nextPositions);
		setPan(fitPan);
		setZoom(fitZoom);
		setSelectedNode(null);
	}, [edges, nodes, rememberCurrentPositions]);

	const handleRepairOverlaps = useCallback(() => {
		const layer = nodeLayerRef.current;
		if (
			!layer ||
			layer.clientWidth === 0 ||
			layer.clientHeight === 0 ||
			nodes.length === 0
		) {
			return;
		}

		const gap = CANVAS_GRID_SIZE;
		const placedRects: Array<{
			bottom: number;
			left: number;
			right: number;
			top: number;
		}> = [];
		const nextPositions: Record<string, CanvasPosition> = {};

		for (const node of nodes) {
			const element = nodeRefs.current[node.id];
			const width = element?.offsetWidth ?? 1;
			const height = element?.offsetHeight ?? 1;
			const currentPosition = nodePositions[node.id] ?? {
				left: node.left,
				top: node.top,
			};
			let left = Math.max(
				0,
				Math.round(
					((currentPosition.left / 100) * layer.clientWidth) / CANVAS_GRID_SIZE,
				) * CANVAS_GRID_SIZE,
			);
			let top = Math.max(
				0,
				Math.round(
					((currentPosition.top / 100) * layer.clientHeight) / CANVAS_GRID_SIZE,
				) * CANVAS_GRID_SIZE,
			);
			let attempts = 0;

			while (
				attempts < 200 &&
				placedRects.some(
					(rect) =>
						left < rect.right + gap &&
						left + width + gap > rect.left &&
						top < rect.bottom + gap &&
						top + height + gap > rect.top,
				)
			) {
				left += CANVAS_GRID_SIZE;
				if (left + width > layer.clientWidth) {
					left = 0;
					top += CANVAS_GRID_SIZE;
				}
				if (top + height > layer.clientHeight) {
					left = 0;
					top = 0;
				}
				attempts += 1;
			}

			const position = canvasPositionFromPixels(left, top, layer);
			nextPositions[node.id] = position;
			const placedLeft = (position.left / 100) * layer.clientWidth;
			const placedTop = (position.top / 100) * layer.clientHeight;
			placedRects.push({
				bottom: placedTop + height,
				left: placedLeft,
				right: placedLeft + width,
				top: placedTop,
			});
		}

		rememberCurrentPositions();
		setNodePositions(nextPositions);
		setSelectedNode(null);
	}, [nodePositions, nodes, rememberCurrentPositions]);

	const handleResetCanvas = useCallback(() => {
		if (typeof window !== "undefined") {
			try {
				window.localStorage.removeItem(storageKey);
			} catch {
				// Local storage can be unavailable in private or restricted contexts.
			}
		}
		rememberCurrentPositions();
		setNodePositions(
			nodeLayerRef.current
				? getSnappedPositions(initialPositions)
				: initialPositions,
		);
		setPan({ x: 0, y: 0 });
		setZoom(1);
		setSelectedNode(null);
	}, [
		getSnappedPositions,
		initialPositions,
		rememberCurrentPositions,
		storageKey,
	]);

	const handleNodeSelect = useCallback(
		(nodeId: string) => {
			if (dragMovedRef.current) {
				dragMovedRef.current = false;
				return;
			}

			setSelectedNode(nodeId);
			const node = nodes.find((candidate) => candidate.id === nodeId);
			if (node && isPanelServiceType(node.type)) {
				openServicePanel(node.serviceId ?? node.id);
			}
		},
		[nodes, openServicePanel],
	);

	const handleServiceAction = useCallback(
		(node: CanvasNode, action: "start" | "stop" | "deploy") => {
			if (!node.serviceId) return;
			if (onServiceAction) {
				onServiceAction(node, action);
				return;
			}
			openService(node, action === "deploy" ? "deployments" : "general");
		},
		[onServiceAction, openService],
	);

	const handleDuplicateService = useCallback(
		(node: CanvasNode) => {
			if (!node.serviceId) return;
			if (onDuplicateService) {
				onDuplicateService(node);
				return;
			}
			toast.info("Open the service page to duplicate this service");
		},
		[onDuplicateService],
	);

	const handleDeleteService = useCallback(
		(node: CanvasNode) => {
			if (!node.serviceId) return;
			if (onDeleteService) {
				onDeleteService(node);
				return;
			}
			openService(node);
		},
		[onDeleteService, openService],
	);

	return (
		<div
			aria-label={`${projectName} / ${environmentName} architecture canvas`}
			className="h-full w-full"
			role="application"
		>
			<div
				className="relative h-full min-h-[610px] overflow-hidden rounded-xl border border-[#33323e] bg-[#13111c]"
				ref={canvasRef}
				onPointerDown={handleCanvasPointerDown}
				onPointerMove={handleCanvasPointerMove}
				onPointerUp={stopCanvasPan}
				onPointerCancel={stopCanvasPan}
				style={{
					cursor: panState ? "grabbing" : "grab",
					touchAction: "none",
				}}
			>
				{environmentId && (
					<div
						className="absolute right-4 top-4 z-30 lg:right-8 lg:top-7"
						onPointerDown={(event) => event.stopPropagation()}
					>
						<DropdownMenu open={isAddOpen} onOpenChange={setIsAddOpen}>
							<DropdownMenuTrigger asChild>
								<button
									className="flex h-[34px] items-center gap-2 rounded-lg border border-white/[0.12] bg-[#242130]/90 px-3 text-sm font-medium text-[#eeeaf5] shadow-[0_6px_18px_rgba(0,0,0,0.16)] transition-colors hover:border-white/[0.25] hover:bg-[#2a2638]"
									type="button"
								>
									<Plus className="h-4 w-4 text-[#a8a2b5] lg:h-5 lg:w-5" />
									<span>Add</span>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-[200px] space-y-1.5 border border-[#33323e] bg-[#181622]/95 p-1.5 text-[#a7a2b3] shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
							>
								<DropdownMenuLabel className="text-xs font-normal text-[#8e8a9c]">
									Create Service
								</DropdownMenuLabel>
								<AddApplication
									projectName={projectName}
									environmentId={environmentId}
								/>
								<AddDatabase
									projectName={projectName}
									environmentId={environmentId}
								/>
								<AddCompose
									projectName={projectName}
									environmentId={environmentId}
								/>
								<AddTemplate environmentId={environmentId} />
								<AddAiAssistant
									projectName={projectName}
									environmentId={environmentId}
								/>
								<AddImport
									projectName={projectName}
									environmentId={environmentId}
								/>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}

				<div
					className="absolute inset-0 origin-center transition-transform duration-200 ease-out"
					ref={nodeLayerRef}
					style={{
						transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
						transformOrigin: "0 0",
						transition: dragState || panState ? "none" : undefined,
					}}
				>
					{showGrid && (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute"
							style={{
								backgroundImage:
									"radial-gradient(circle, rgba(255,255,255,0.16) 0.8px, transparent 0.9px)",
								backgroundPosition: "0 0",
								backgroundRepeat: "repeat",
								backgroundSize: `${CANVAS_GRID_SIZE}px ${CANVAS_GRID_SIZE}px`,
								height: "48000px",
								left: "-24000px",
								top: "-24000px",
								width: "48000px",
							}}
						/>
					)}
					<svg
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 h-full w-full"
						preserveAspectRatio="none"
						viewBox={`0 0 ${Math.max(canvasSize.width, 1)} ${Math.max(canvasSize.height, 1)}`}
					>
						<defs>
							<marker
								id="canvas-arrow"
								markerHeight="8"
								markerWidth="8"
								orient="auto-start-reverse"
								refX="7"
								refY="4"
								viewBox="0 0 8 8"
							>
								<path d="M0,0 L8,4 L0,8 z" fill="#777286" />
							</marker>
						</defs>
						<g
							fill="none"
							stroke="#777286"
							strokeDasharray="6 8"
							strokeLinecap="round"
							strokeWidth="1.25"
						>
							{showConnections &&
								edges.map((edge) => {
									const source = nodeRects[edge.source];
									const target = nodeRects[edge.target];
									if (!source || !target) return null;
									const isVisible =
										edge.kind === "network"
											? showNetworkTraffic
											: showVariableReferences;
									if (!isVisible) return null;
									return (
										<path
											key={edge.id}
											d={getOrthogonalPath(source, target)}
											markerEnd="url(#canvas-arrow)"
											markerStart={
												edge.bidirectional ? "url(#canvas-arrow)" : undefined
											}
										/>
									);
								})}
						</g>
					</svg>

					{nodes.map((node) => (
						<CanvasNodeCard
							canDelete={canDelete}
							canDeploy={canDeploy}
							key={node.id}
							dragging={dragState?.id === node.id}
							grouped={selectedNode === node.id}
							node={node}
							nodeRef={(element) => {
								nodeRefs.current[node.id] = element;
							}}
							onPointerDown={(event) => handleNodePointerDown(event, node)}
							position={
								nodePositions[node.id] ?? {
									left: node.left,
									top: node.top,
								}
							}
							onAction={(action) => handleServiceAction(node, action)}
							onDelete={() => handleDeleteService(node)}
							onDuplicate={() => handleDuplicateService(node)}
							onGroupToggle={() => toggleNodeGroup(node.id)}
							onOpenService={(tab) => openService(node, tab)}
							onSelect={() => handleNodeSelect(node.id)}
							selected={activePanelNode?.id === node.id}
						/>
					))}
				</div>

				{nodes.length === 0 && (
					<div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-20">
						<div className="pointer-events-auto flex max-w-sm flex-col items-center rounded-2xl border border-white/[0.08] bg-[#1c1a28]/90 p-8 shadow-2xl backdrop-blur-sm">
							<div className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#a667e4] shadow-inner mb-4">
								<Boxes className="size-7" />
							</div>
							<h3 className="text-base font-semibold text-white">
								No services deployed
							</h3>
							<p className="mt-1.5 text-xs text-[#8f8a9d] leading-relaxed">
								This environment currently has no services. Add an application,
								compose stack, or database to get started.
							</p>
							{environmentId && (
								<div className="mt-5">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												className="h-9 gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/25 px-4 text-xs font-medium text-violet-200 hover:bg-violet-600/35 hover:text-white"
												size="sm"
											>
												<Plus className="size-3.5" />
												<span>Add Service</span>
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent
											align="center"
											className="w-[200px] space-y-1.5 border border-[#33323e] bg-[#181622]/95 p-1.5 text-[#a7a2b3] shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
										>
											<DropdownMenuLabel className="text-xs font-normal text-[#8e8a9c]">
												Create Service
											</DropdownMenuLabel>
											<AddApplication
												projectName={projectName}
												environmentId={environmentId}
											/>
											<AddDatabase
												projectName={projectName}
												environmentId={environmentId}
											/>
											<AddCompose
												projectName={projectName}
												environmentId={environmentId}
											/>
											<AddTemplate environmentId={environmentId} />
											<AddAiAssistant
												projectName={projectName}
												environmentId={environmentId}
											/>
											<AddImport
												projectName={projectName}
												environmentId={environmentId}
											/>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							)}
						</div>
					</div>
				)}

				{activePanelService && (
					<div
						className="absolute inset-0 z-40 cursor-default bg-black/20 transition-opacity duration-200"
						onClick={(event) => {
							if (event.target === event.currentTarget) {
								closeServicePanel();
							}
						}}
					>
						<RailwayServicePanel
							activeTab={activePanelTab}
							environmentId={environmentId || ""}
							initialTab={activePanelTab}
							onClose={closeServicePanel}
							onTabChange={handlePanelTabChange}
							projectId={projectId || ""}
							service={activePanelService}
						/>
					</div>
				)}

				<div
					aria-label="Canvas options"
					className="architecture-canvas-controls absolute bottom-4 left-4 z-30 grid gap-2"
					onPointerDown={(event) => event.stopPropagation()}
					role="toolbar"
				>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								aria-label="Canvas actions"
								className="flex size-9 items-center justify-center rounded-md border border-[#33323e] bg-[#181622]/95 text-[#a7a2b3] transition-colors hover:bg-white/[0.06] hover:text-white"
								type="button"
							>
								<Grip className="h-5 w-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							side="right"
							sideOffset={10}
							className="w-[260px] rounded-lg border border-[#33323e] bg-[#181622]/95 p-1.5 text-[#a7a2b3] shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
						>
							<DropdownMenuItem
								className="min-h-9 cursor-pointer gap-2.5 rounded-md px-2.5 text-sm leading-none focus:bg-white/[0.07] focus:text-white"
								onSelect={toggleAllConnections}
							>
								{showConnections ? (
									<Unlink className="size-4" />
								) : (
									<Link2 className="size-4" />
								)}
								{showConnections ? "Hide Connections" : "Show Connections"}
							</DropdownMenuItem>
							<DropdownMenuItem
								className="min-h-9 cursor-pointer gap-2.5 rounded-md px-2.5 text-sm leading-none focus:bg-white/[0.07] focus:text-white"
								onSelect={handleAutoLayout}
							>
								<Layers3 className="size-4" />
								Auto Layout
							</DropdownMenuItem>
							<DropdownMenuItem
								className="min-h-9 cursor-pointer gap-2.5 rounded-md px-2.5 text-sm leading-none focus:bg-white/[0.07] focus:text-white"
								onSelect={handleRepairOverlaps}
							>
								<Wrench className="size-4" />
								Repair Overlaps
							</DropdownMenuItem>
							<DropdownMenuItem
								className="min-h-9 cursor-pointer gap-2.5 rounded-md px-2.5 text-sm leading-none focus:bg-white/[0.07] focus:text-white"
								onSelect={handleResetCanvas}
							>
								<RotateCcw className="size-4" />
								Reset Canvas
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<fieldset
						aria-label="canvas action"
						className="overflow-hidden rounded-md border border-[#33323e] bg-[#181622]/95"
					>
						<CanvasControl
							aria-label="Zoom in"
							disabled={zoom >= CANVAS_MAX_ZOOM}
							grouped
							onClick={() => zoomAtCenter("in")}
						>
							<Plus className="h-5 w-4" />
						</CanvasControl>
						<CanvasControl
							aria-label="Zoom out"
							disabled={zoom <= CANVAS_MIN_ZOOM}
							grouped
							onClick={() => zoomAtCenter("out")}
						>
							<Minus className="h-5 w-4" />
						</CanvasControl>
						<CanvasControl
							aria-label="Center canvas"
							grouped
							onClick={() => {
								setZoom(1);
								setPan({ x: 0, y: 0 });
							}}
						>
							<Maximize2 className="h-5 w-4" />
						</CanvasControl>
					</fieldset>

					<fieldset
						aria-label="canvas action"
						className="overflow-hidden rounded-md border border-[#33323e] bg-[#181622]/95"
					>
						<CanvasControl
							aria-label="Undo"
							disabled={history.length === 0}
							grouped
							onClick={handleUndo}
						>
							<Undo2 className="h-5 w-4" />
						</CanvasControl>
						<CanvasControl
							aria-label="Redo"
							disabled={redoHistory.length === 0}
							grouped
							onClick={handleRedo}
						>
							<Redo2 className="h-5 w-4" />
						</CanvasControl>
					</fieldset>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								aria-label="Connection visibility"
								className="flex size-9 items-center justify-center rounded-md border border-[#33323e] bg-[#181622]/95 text-[#a7a2b3] transition-colors hover:bg-white/[0.06] hover:text-white"
								type="button"
							>
								<Layers3 className="h-5 w-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							side="right"
							sideOffset={10}
							className="w-[320px] rounded-lg border border-[#33323e] bg-[#181622]/95 p-1.5 text-[#a7a2b3] shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
						>
							<DropdownMenuItem
								className={`min-h-[62px] cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 focus:bg-white/[0.07] focus:text-white ${showNetworkTraffic ? "bg-white/[0.025]" : "opacity-60"}`}
								onSelect={() => setShowNetworkTraffic((value) => !value)}
							>
								<Network className="mt-1 size-4 shrink-0" />
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="text-sm leading-5 text-[#eeeaf5]">
										Network Traffic
									</span>
									<span className="text-xs leading-4 text-[#858091]">
										Show traffic between services
									</span>
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								className={`min-h-[62px] cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 focus:bg-white/[0.07] focus:text-white ${showVariableReferences ? "bg-white/[0.025]" : "opacity-60"}`}
								onSelect={() => setShowVariableReferences((value) => !value)}
							>
								<Link2 className="mt-1 size-4 shrink-0" />
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="text-sm leading-5 text-[#eeeaf5]">
										Variable References
									</span>
									<span className="text-xs leading-4 text-[#858091]">
										Show variable connections
									</span>
								</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	);
};
