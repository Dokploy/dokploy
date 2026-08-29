import {
	Archive,
	Atom,
	Database,
	Grip,
	HardDrive,
	Layers3,
	Maximize2,
	Minus,
	Plus,
	Redo2,
	Server,
	Undo2,
} from "lucide-react";
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
import { PostgresqlIcon } from "@/components/icons/data-tools-icons";

export type CanvasService = {
	id: string;
	name: string;
	type: string;
	status?: string;
	icon?: string | null;
};

interface ProjectCanvasProps {
	projectName: string;
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
	source: string;
	target: string;
};

type CanvasDragState = {
	id: string;
	startPosition: CanvasPosition;
	startX: number;
	startY: number;
};

type IconComponent = ComponentType<{ className?: string }>;

const nodeIconMap: Record<string, IconComponent> = {
	application: Atom,
	compose: Server,
	postgres: PostgresqlIcon,
	mysql: Database,
	mariadb: Database,
	mongo: Database,
	redis: Database,
	libsql: Database,
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

const fallbackNodes: CanvasNode[] = [
	{
		id: "frontend",
		title: "Frontend",
		subtitle: "eterniza.opuslab.dev",
		type: "application",
		status: "Online",
		left: 4.5,
		top: 41.62,
	},
	{
		id: "backend",
		title: "Backend",
		subtitle: "backend-production-3cdaf.u...",
		type: "compose",
		status: "Online",
		left: 37.6,
		top: 41.62,
	},
	{
		id: "bucket",
		title: "bucket",
		metric: "5.2 MB",
		type: "bucket",
		left: 68.6,
		top: 13.93,
	},
	{
		id: "postgres",
		title: "Postgres",
		type: "postgres",
		status: "Online",
		volume: "postgres-volume",
		left: 70.6,
		top: 63.79,
	},
];

const actualNodePositions = [
	{ left: 4.5, top: 41.62 },
	{ left: 37.6, top: 41.62 },
	{ left: 68.6, top: 13.93 },
	{ left: 70.6, top: 63.79 },
	{ left: 40, top: 18 },
	{ left: 8, top: 18 },
];

const buildNodes = (services: CanvasService[]): CanvasNode[] => {
	if (services.length === 0) return fallbackNodes;

	return services.slice(0, actualNodePositions.length).map((service, index) => {
		const position = actualNodePositions[index] ?? { left: 4.5, top: 48 };
		const normalizedType = service.type.toLowerCase();
		const isStorage =
			normalizedType === "bucket" || normalizedType === "storage";

		return {
			id: `${service.type}-${service.id}`,
			title: service.name,
			subtitle: isStorage ? undefined : service.type,
			metric: isStorage ? "5.2 MB" : undefined,
			status: isStorage
				? undefined
				: isOnline(service.status)
					? "Online"
					: "Offline",
			volume: normalizedType === "postgres" ? "postgres-volume" : undefined,
			type: isStorage ? "bucket" : normalizedType,
			icon: service.icon,
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
	) => {
		if (!source || !target || source.id === target.id) return;
		if (
			edges.some(
				(edge) => edge.source === source.id && edge.target === target.id,
			)
		) {
			return;
		}
		edges.push({
			bidirectional,
			id: `${source.id}-${target.id}`,
			source: source.id,
			target: target.id,
		});
	};

	const application = nodes.find((node) => node.type === "application");
	const compose = nodes.find((node) => node.type === "compose");
	const bucket = nodes.find((node) => node.type === "bucket");
	const postgres = nodes.find((node) => node.type === "postgres");
	const primary = compose ?? application ?? nodes[0];

	addEdge(application, compose, true);
	addEdge(primary, bucket);
	addEdge(primary, postgres);

	if (edges.length === 0) {
		for (let index = 1; index < nodes.length; index += 1) {
			addEdge(nodes[index - 1], nodes[index]);
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

interface CanvasNodeCardProps {
	dragging: boolean;
	node: CanvasNode;
	nodeRef: (element: HTMLButtonElement | null) => void;
	onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
	position: CanvasPosition;
	selected: boolean;
	onSelect: () => void;
}

const CanvasNodeCard = ({
	dragging,
	node,
	nodeRef,
	onPointerDown,
	position,
	selected,
	onSelect,
}: CanvasNodeCardProps) => {
	const Icon = nodeIconMap[node.type] ?? Server;
	const iconClass = nodeIconClassMap[node.type] ?? "text-[#d7d2e7]";
	const nodeIsOnline = isOnline(node.status);
	const minHeightClass = node.volume ? "min-h-[158px]" : "min-h-[118px]";

	return (
		<button
			aria-pressed={selected}
			aria-label={`Select ${node.title}`}
			aria-grabbed={dragging}
			className={`absolute flex ${minHeightClass} w-[clamp(230px,23.2vw,480px)] touch-none select-none flex-col overflow-hidden rounded-2xl border bg-[#1c1a27]/95 text-left shadow-[0_12px_34px_rgba(0,0,0,0.16)] transition-[border-color,box-shadow,background-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a667e4] ${dragging ? "cursor-grabbing" : "cursor-grab"} lg:min-h-[200px] ${selected ? "border-[#a667e4]/80 shadow-[0_0_0_2px_rgba(166,103,228,0.2),0_12px_34px_rgba(0,0,0,0.22)]" : "border-white/[0.14] hover:border-white/[0.25] hover:bg-[#211f2d]"}`}
			onClick={onSelect}
			onPointerDown={onPointerDown}
			ref={nodeRef}
			style={{ left: `${position.left}%`, top: `${position.top}%` }}
			type="button"
		>
			<div className="flex items-start gap-4 px-6 pb-0 pt-6 lg:px-8 lg:pb-0 lg:pt-7">
				<div className={`mt-0.5 shrink-0 ${iconClass}`}>
					{node.icon ? (
						<img
							alt=""
							className="size-7 object-contain lg:size-8"
							src={node.icon}
						/>
					) : (
						<Icon className="size-7 lg:size-8" />
					)}
				</div>
				<div className="min-w-0">
					<div className="truncate text-base font-semibold tracking-[-0.01em] text-white lg:text-xl">
						{node.title}
					</div>
					{node.subtitle && (
						<div className="truncate text-sm text-[#9a96a9] lg:text-base">
							{node.subtitle}
						</div>
					)}
				</div>
			</div>

			{node.metric && (
				<div className="mt-auto px-6 pb-7 text-sm text-[#a5a0b0] lg:px-8 lg:text-base">
					{node.metric}
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
					<span className={nodeIsOnline ? "text-[#55bd95]" : "text-[#dda15f]"}>
						{node.status}
					</span>
				</div>
			)}

			{node.volume && (
				<div className="mt-auto flex items-center gap-3 border-t border-white/[0.09] px-6 py-4 text-sm text-[#858091] lg:px-8 lg:py-5 lg:text-base">
					<HardDrive className="size-4 lg:size-5" />
					<span className="truncate">{node.volume}</span>
				</div>
			)}
		</button>
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
	projectName,
	environmentName,
	services,
}: ProjectCanvasProps) => {
	const [zoom, setZoom] = useState(1);
	const [showGrid, setShowGrid] = useState(true);
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [isAddOpen, setIsAddOpen] = useState(false);
	const nodes = useMemo(() => buildNodes(services), [services]);
	const edges = useMemo(() => buildEdges(nodes), [nodes]);
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
	const canvasRef = useRef<HTMLDivElement>(null);
	const nodeLayerRef = useRef<HTMLDivElement>(null);
	const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const dragMovedRef = useRef(false);

	useEffect(() => {
		let storedPositions: Record<string, CanvasPosition> = {};
		if (typeof window !== "undefined") {
			try {
				const storedValue = window.localStorage.getItem(storageKey);
				if (storedValue) {
					const parsed = JSON.parse(storedValue) as Record<string, unknown>;
					storedPositions = Object.fromEntries(
						Object.entries(parsed).filter(([, value]) =>
							isCanvasPosition(value),
						),
					) as Record<string, CanvasPosition>;
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
		setHydratedStorageKey(storageKey);
	}, [nodes, storageKey]);

	useEffect(() => {
		if (hydratedStorageKey !== storageKey || typeof window === "undefined") {
			return;
		}
		window.localStorage.setItem(storageKey, JSON.stringify(nodePositions));
	}, [hydratedStorageKey, nodePositions, storageKey]);

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
	}, [nodes]);

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
			try {
				event.currentTarget.setPointerCapture(event.pointerId);
			} catch {
				// Pointer capture is not available in every embedded browser surface.
			}
			dragMovedRef.current = false;
			setDragState({
				id: node.id,
				startPosition: nodePositions[node.id] ?? {
					left: node.left,
					top: node.top,
				},
				startX: event.clientX,
				startY: event.clientY,
			});
		},
		[nodePositions],
	);

	useEffect(() => {
		if (!dragState) return;

		const handlePointerMove = (event: globalThis.PointerEvent) => {
			const layer = nodeLayerRef.current;
			if (!layer || layer.clientWidth === 0 || layer.clientHeight === 0) return;
			event.preventDefault();
			const layerRect = layer.getBoundingClientRect();
			const deltaLeft =
				((event.clientX - dragState.startX) / layerRect.width) * 100;
			const deltaTop =
				((event.clientY - dragState.startY) / layerRect.height) * 100;
			if (Math.abs(deltaLeft) > 0.2 || Math.abs(deltaTop) > 0.2) {
				dragMovedRef.current = true;
			}

			const element = nodeRefs.current[dragState.id];
			const widthPercent = element
				? (element.offsetWidth / layer.clientWidth) * 100
				: 0;
			const heightPercent = element
				? (element.offsetHeight / layer.clientHeight) * 100
				: 0;
			setNodePositions((currentPositions) => ({
				...currentPositions,
				[dragState.id]: {
					left: clamp(
						dragState.startPosition.left + deltaLeft,
						0,
						100 - widthPercent,
					),
					top: clamp(
						dragState.startPosition.top + deltaTop,
						0,
						100 - heightPercent,
					),
				},
			}));
		};
		const stopDragging = () => setDragState(null);

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

	const handleNodeSelect = useCallback((nodeId: string) => {
		if (dragMovedRef.current) {
			dragMovedRef.current = false;
			return;
		}
		setSelectedNode(nodeId);
	}, []);

	return (
		<div
			aria-label={`${projectName} / ${environmentName} architecture canvas`}
			className="h-full w-full"
			role="application"
		>
			<div
				className="relative h-full min-h-[610px] overflow-hidden rounded-xl border border-[#33323e] bg-[#13111c]"
				ref={canvasRef}
				style={
					showGrid
						? {
								backgroundImage:
									"radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1px)",
								backgroundSize: "36px 36px",
							}
						: undefined
				}
			>
				<div className="absolute right-4 top-4 z-30 lg:right-8 lg:top-7">
					<button
						aria-expanded={isAddOpen}
						aria-haspopup="menu"
						className="flex h-[34px] items-center gap-2 rounded-lg border border-white/[0.12] bg-[#242130]/90 px-3 text-sm font-medium text-[#eeeaf5] shadow-[0_6px_18px_rgba(0,0,0,0.16)] transition-colors hover:border-white/[0.25] hover:bg-[#2a2638] lg:h-[58px] lg:gap-3 lg:px-6 lg:text-base"
						onClick={() => setIsAddOpen((value) => !value)}
						type="button"
					>
						<Plus className="h-4 w-4 text-[#a8a2b5] lg:h-5 lg:w-5" />
						<span>Add</span>
					</button>
					{isAddOpen && (
						<div
							aria-label="Add service"
							className="absolute right-0 mt-2 w-48 overflow-hidden rounded-lg border border-white/[0.12] bg-[#211f2e] p-1.5 text-sm shadow-[0_14px_36px_rgba(0,0,0,0.35)]"
							role="menu"
						>
							{["Application", "Compose", "Database", "Bucket"].map((label) => (
								<button
									className="flex w-full items-center rounded-md px-3 py-2 text-left text-[#bcb7c8] transition-colors hover:bg-white/[0.06] hover:text-white"
									key={label}
									onClick={() => setIsAddOpen(false)}
									type="button"
								>
									{label}
								</button>
							))}
						</div>
					)}
				</div>

				<div
					className="absolute inset-0 origin-center transition-transform duration-200 ease-out"
					ref={nodeLayerRef}
					style={{ transform: `scale(${zoom})` }}
				>
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
							{edges.map((edge) => {
								const source = nodeRects[edge.source];
								const target = nodeRects[edge.target];
								if (!source || !target) return null;
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
							key={node.id}
							dragging={dragState?.id === node.id}
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
							onSelect={() => handleNodeSelect(node.id)}
							selected={selectedNode === node.id}
						/>
					))}
				</div>

				<div
					aria-label="Canvas options"
					className="architecture-canvas-controls absolute bottom-4 left-4 z-30 grid gap-2"
					role="toolbar"
				>
					<CanvasControl
						aria-label="Canvas settings"
						onClick={() => setShowGrid((value) => !value)}
					>
						<Grip className="h-5 w-4" />
					</CanvasControl>

					<fieldset
						aria-label="canvas action"
						className="overflow-hidden rounded-md border border-[#33323e] bg-[#181622]/95"
					>
						<CanvasControl
							aria-label="Zoom in"
							disabled={zoom >= 1.35}
							grouped
							onClick={() => setZoom((value) => Math.min(1.35, value + 0.1))}
						>
							<Plus className="h-5 w-4" />
						</CanvasControl>
						<CanvasControl
							aria-label="Zoom out"
							disabled={zoom <= 0.7}
							grouped
							onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))}
						>
							<Minus className="h-5 w-4" />
						</CanvasControl>
						<CanvasControl
							aria-label="Center canvas"
							grouped
							onClick={() => setZoom(1)}
						>
							<Maximize2 className="h-5 w-4" />
						</CanvasControl>
					</fieldset>

					<fieldset
						aria-label="canvas action"
						className="overflow-hidden rounded-md border border-[#33323e] bg-[#181622]/95"
					>
						<CanvasControl aria-label="Undo" grouped onClick={() => undefined}>
							<Undo2 className="h-5 w-4" />
						</CanvasControl>
						<CanvasControl aria-label="Redo" grouped onClick={() => undefined}>
							<Redo2 className="h-5 w-4" />
						</CanvasControl>
					</fieldset>

					<CanvasControl
						aria-label="Visibility layers"
						onClick={() => undefined}
					>
						<Layers3 className="h-5 w-4" />
					</CanvasControl>
				</div>
			</div>
		</div>
	);
};
