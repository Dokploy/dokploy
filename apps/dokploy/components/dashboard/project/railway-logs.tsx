"use client";

import copy from "copy-to-clipboard";
import { FancyAnsi } from "fancy-ansi";
import escapeRegExp from "lodash/escapeRegExp";
import {
	ArrowDown,
	Check,
	Clock,
	Copy,
	Download,
	Hash,
	Layers,
	ListFilter,
	Loader2,
	Pause,
	Play,
	RotateCcw,
	Search,
	SquareTerminal,
	Trash2,
	WrapText,
	X,
} from "lucide-react";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { AnalyzeLogs } from "@/components/dashboard/docker/logs/analyze-logs";
import {
	getLogType,
	type LogLine,
	type LogType,
	parseLogs,
} from "@/components/dashboard/docker/logs/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";
import type { RailwayService } from "./railway-service-types";

export type RailwayTimeFilter = "5m" | "15m" | "1h" | "24h" | "all";

interface Props {
	service: RailwayService;
	projectId?: string;
	environmentId?: string;
	className?: string;
}

const LINE_LIMIT_OPTIONS = [50, 100, 250, 500, 1000, 2000] as const;

const TIME_FILTER_OPTIONS: Array<{ label: string; value: RailwayTimeFilter }> =
	[
		{ label: "Last 5 minutes", value: "5m" },
		{ label: "Last 15 minutes", value: "15m" },
		{ label: "Last hour", value: "1h" },
		{ label: "Last 24 hours", value: "24h" },
		{ label: "All time", value: "all" },
	];

const LOG_LEVELS: Array<{
	label: string;
	value: LogType;
	color: string;
	badgeClass: string;
}> = [
	{
		label: "Info",
		value: "info",
		color: "text-sky-400",
		badgeClass: "bg-sky-500/10 text-sky-400 border-sky-500/20",
	},
	{
		label: "Success",
		value: "success",
		color: "text-emerald-400",
		badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
	},
	{
		label: "Warning",
		value: "warning",
		color: "text-amber-400",
		badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
	},
	{
		label: "Error",
		value: "error",
		color: "text-rose-400",
		badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
	},
	{
		label: "Debug",
		value: "debug",
		color: "text-purple-400",
		badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
	},
];

const getStatusBadge = (state?: string) => {
	const s = state?.toLowerCase() || "";
	if (s.includes("running") || s.includes("ready")) {
		return {
			dot: "bg-emerald-400 ring-emerald-400/20",
			badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
			label: state || "running",
		};
	}
	if (s.includes("exit") || s.includes("dead") || s.includes("shutdown")) {
		return {
			dot: "bg-rose-400 ring-rose-400/20",
			badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
			label: state || "exited",
		};
	}
	if (s.includes("restart") || s.includes("paused")) {
		return {
			dot: "bg-amber-400 ring-amber-400/20",
			badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
			label: state || "restarting",
		};
	}
	if (s.includes("created") || s.includes("accepted")) {
		return {
			dot: "bg-sky-400 ring-sky-400/20",
			badge: "bg-sky-500/10 text-sky-400 border-sky-500/20",
			label: state || "created",
		};
	}
	return {
		dot: "bg-zinc-400 ring-zinc-400/20",
		badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
		label: state || "unknown",
	};
};

const fancyAnsi = new FancyAnsi();

const LogLineRenderer: React.FC<{
	log: LogLine;
	index: number;
	showTimestamp: boolean;
	searchTerm: string;
	wrapLines: boolean;
}> = React.memo(({ log, index, showTimestamp, searchTerm, wrapLines }) => {
	const { timestamp, message, rawTimestamp } = log;
	const { type } = getLogType(message);

	const formattedTime = useMemo(() => {
		if (!timestamp) return null;
		try {
			return timestamp.toLocaleTimeString([], {
				hour12: false,
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				fractionalSecondDigits: 3,
			});
		} catch {
			return timestamp.toLocaleTimeString();
		}
	}, [timestamp]);

	const renderedHtml = useMemo(() => {
		let html = fancyAnsi.toHtml(message);
		if (searchTerm?.trim()) {
			try {
				const regex = new RegExp(`(${escapeRegExp(searchTerm.trim())})`, "gi");
				html = html.replace(
					regex,
					'<span class="bg-amber-500/40 text-amber-100 font-bold px-0.5 rounded">$1</span>',
				);
			} catch {
				// ignore invalid regex
			}
		}
		return html;
	}, [message, searchTerm]);

	const levelBadge = useMemo(() => {
		switch (type) {
			case "error":
				return (
					<span className="shrink-0 inline-flex items-center justify-center w-12 px-1 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
						ERR
					</span>
				);
			case "warning":
				return (
					<span className="shrink-0 inline-flex items-center justify-center w-12 px-1 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
						WARN
					</span>
				);
			case "success":
				return (
					<span className="shrink-0 inline-flex items-center justify-center w-12 px-1 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
						OK
					</span>
				);
			case "debug":
				return (
					<span className="shrink-0 inline-flex items-center justify-center w-12 px-1 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/30">
						DBG
					</span>
				);
			default:
				return (
					<span className="shrink-0 inline-flex items-center justify-center w-12 px-1 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
						INFO
					</span>
				);
		}
	}, [type]);

	return (
		<div
			className={cn(
				"group relative flex items-start gap-3 py-1 px-3.5 font-mono text-[12.5px] leading-5 transition-colors",
				type === "error"
					? "bg-rose-950/20 hover:bg-rose-950/30 text-rose-200/90"
					: type === "warning"
						? "bg-amber-950/15 hover:bg-amber-950/25 text-amber-200/90"
						: type === "debug"
							? "bg-purple-950/15 hover:bg-purple-950/25 text-purple-200/90"
							: "hover:bg-white/[0.03] text-[#d6d3e2]",
			)}
		>
			<div className="flex shrink-0 items-center gap-2 select-none pt-0.5">
				<span
					className="w-9 text-right text-[11px] text-[#555163] font-mono select-none"
					title={`Line ${index + 1}`}
				>
					{index + 1}
				</span>

				{showTimestamp && (
					<TooltipProvider delayDuration={150}>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="text-[11px] text-[#7d798a] select-none shrink-0 font-mono tracking-tight">
									{formattedTime || "---"}
								</span>
							</TooltipTrigger>
							{rawTimestamp && (
								<TooltipContent
									side="top"
									className="border-[#332f42] bg-[#1a1727] text-xs text-[#cbc7d8]"
								>
									{rawTimestamp}
								</TooltipContent>
							)}
						</Tooltip>
					</TooltipProvider>
				)}

				{levelBadge}
			</div>

			<div
				className={cn(
					"min-w-0 flex-1 break-words",
					wrapLines ? "whitespace-pre-wrap break-all" : "whitespace-pre",
				)}
				dangerouslySetInnerHTML={{ __html: renderedHtml }}
			/>
		</div>
	);
});
LogLineRenderer.displayName = "LogLineRenderer";

export const RailwayLogs: React.FC<Props> = ({
	service,
	projectId: _projectId,
	environmentId: _environmentId,
	className,
}) => {
	const isApplication = service.type === "application";
	const isCompose = service.type === "compose";
	const runtimeAppName = service.appName || service.name;
	const serverId = service.serverId || undefined;

	// State for runType: Native vs Swarm
	const [runType, setRunType] = useState<"native" | "swarm">("native");
	const [containerId, setContainerId] = useState<string>("");

	// Query containers for Native mode
	const {
		data: nativeContainers,
		isPending: isLoadingNative,
		refetch: refetchNative,
	} = api.docker.getContainersByAppNameMatch.useQuery(
		{
			appName: runtimeAppName,
			serverId,
			appType: isCompose ? service.composeType || "docker-compose" : undefined,
		},
		{
			enabled: !!runtimeAppName && runType === "native",
			refetchInterval: 15000,
		},
	);

	// Query containers for Swarm mode
	const {
		data: swarmContainers,
		isPending: isLoadingSwarm,
		refetch: refetchSwarm,
	} = api.docker.getServiceContainersByAppName.useQuery(
		{
			appName: runtimeAppName,
			serverId,
		},
		{
			enabled: !!runtimeAppName && runType === "swarm" && isApplication,
			refetchInterval: 15000,
		},
	);

	const containers = runType === "native" ? nativeContainers : swarmContainers;
	const isContainersLoading =
		runType === "native" ? isLoadingNative : isLoadingSwarm;

	// Auto-select first container when list arrives
	useEffect(() => {
		if (containers && containers.length > 0) {
			const exists = containers.some((c) => c.containerId === containerId);
			if (!exists || !containerId) {
				setContainerId(containers[0]?.containerId || "");
			}
		} else if (
			!isContainersLoading &&
			(!containers || containers.length === 0)
		) {
			setContainerId("");
		}
	}, [containers, isContainersLoading, containerId]);

	// Toolbar controls state
	const [rawLogs, setRawLogs] = useState<string>("");
	const [search, setSearch] = useState<string>("");
	const [lines, setLines] = useState<number>(100);
	const [since, setSince] = useState<RailwayTimeFilter>("all");
	const [selectedLevels, setSelectedLevels] = useState<LogType[]>([]);
	const [showTimestamp, setShowTimestamp] = useState<boolean>(true);
	const [wrapLines, setWrapLines] = useState<boolean>(true);
	const [isPaused, setIsPaused] = useState<boolean>(false);
	const [messageBuffer, setMessageBuffer] = useState<string[]>([]);
	const [copied, setCopied] = useState<boolean>(false);
	const [isWsConnecting, setIsWsConnecting] = useState<boolean>(false);

	// Scroll controls
	const scrollRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState<boolean>(true);
	const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
	const isPausedRef = useRef<boolean>(false);
	isPausedRef.current = isPaused;

	// WebSocket connection
	useEffect(() => {
		if (!containerId || containerId === "select-a-container") {
			setRawLogs("");
			setMessageBuffer([]);
			return;
		}

		let isCurrent = true;
		let timeoutId: NodeJS.Timeout;

		setIsWsConnecting(true);
		setRawLogs("");
		setMessageBuffer([]);
		setIsPaused(false);
		isPausedRef.current = false;

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const params = new globalThis.URLSearchParams({
			containerId,
			tail: lines.toString(),
			since,
			runType,
		});

		if (serverId) {
			params.append("serverId", serverId);
		}
		if (service.id) {
			params.append("serviceId", service.id);
		}

		const wsUrl = `${protocol}//${
			window.location.host
		}/config/docker-container-logs?${params.toString()}`;
		const ws = new WebSocket(wsUrl);

		const scheduleStopConnecting = () => {
			if (timeoutId) clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				if (isCurrent) {
					setIsWsConnecting(false);
				}
			}, 1500);
		};

		ws.onopen = () => {
			if (!isCurrent) {
				ws.close();
				return;
			}
			scheduleStopConnecting();
		};

		ws.onmessage = (event) => {
			if (!isCurrent) return;
			setIsWsConnecting(false);
			const incomingData = event.data;

			if (isPausedRef.current) {
				setMessageBuffer((prev) => [...prev, incomingData]);
			} else {
				setRawLogs((prev) => {
					const updated = prev + incomingData;
					const split = updated.split("\n");
					if (split.length > lines) {
						return split.slice(-lines).join("\n");
					}
					return updated;
				});
			}
		};

		ws.onerror = (error) => {
			if (!isCurrent) return;
			console.error("RailwayLogs WS error:", error);
			setIsWsConnecting(false);
		};

		ws.onclose = () => {
			if (!isCurrent) return;
			setIsWsConnecting(false);
		};

		return () => {
			isCurrent = false;
			if (timeoutId) clearTimeout(timeoutId);
			if (
				ws.readyState === WebSocket.OPEN ||
				ws.readyState === WebSocket.CONNECTING
			) {
				ws.close();
			}
		};
	}, [containerId, lines, since, runType, serverId, service.id]);

	// Parse raw logs
	const parsedLogs = useMemo(() => {
		return parseLogs(rawLogs);
	}, [rawLogs]);

	// Count logs by level for status badges
	const levelCounts = useMemo(() => {
		const counts: Record<LogType, number> = {
			info: 0,
			success: 0,
			warning: 0,
			error: 0,
			debug: 0,
		};
		for (const log of parsedLogs) {
			const type = getLogType(log.message).type;
			counts[type] = (counts[type] || 0) + 1;
		}
		return counts;
	}, [parsedLogs]);

	// Filter logs by search keyword and log level
	const filteredLogs = useMemo(() => {
		let result = parsedLogs;

		if (selectedLevels.length > 0) {
			result = result.filter((log) => {
				const type = getLogType(log.message).type;
				return selectedLevels.includes(type);
			});
		}

		if (search.trim()) {
			const searchLower = search.toLowerCase();
			result = result.filter((log) =>
				log.message.toLowerCase().includes(searchLower),
			);
		}

		return result;
	}, [parsedLogs, selectedLevels, search]);

	// Scroll handler
	const handleScroll = useCallback(() => {
		if (!scrollRef.current) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const isAtBottom = scrollHeight - scrollTop - clientHeight < 32;
		setAutoScroll(isAtBottom);
		setShowScrollButton(!isAtBottom);
	}, []);

	const scrollToBottom = useCallback(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
			setAutoScroll(true);
			setShowScrollButton(false);
		}
	}, []);

	// Auto-scroll when new logs arrive if enabled
	useEffect(() => {
		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [filteredLogs, autoScroll]);

	// Pause / Resume toggle
	const handleTogglePause = () => {
		if (isPaused) {
			if (messageBuffer.length > 0) {
				const bufferedContent = messageBuffer.join("");
				setRawLogs((prev) => {
					const updated = prev + bufferedContent;
					const split = updated.split("\n");
					if (split.length > lines) {
						return split.slice(-lines).join("\n");
					}
					return updated;
				});
				setMessageBuffer([]);
			}
			setIsPaused(false);
			isPausedRef.current = false;
			toast.info("Logs stream resumed");
		} else {
			setIsPaused(true);
			isPausedRef.current = true;
			toast.warning("Logs stream paused");
		}
	};

	// Copy logs
	const handleCopy = () => {
		if (filteredLogs.length === 0) return;
		const text = filteredLogs
			.map((l) =>
				showTimestamp && l.timestamp
					? `${l.timestamp.toISOString()} ${l.message}`
					: l.message,
			)
			.join("\n");

		const success = copy(text);
		if (success) {
			setCopied(true);
			toast.success("Logs copied to clipboard");
			setTimeout(() => setCopied(false), 2000);
		}
	};

	// Download logs as .log file
	const handleDownload = () => {
		if (filteredLogs.length === 0) return;
		const text = filteredLogs
			.map((l) =>
				showTimestamp && l.timestamp
					? `${l.timestamp.toISOString()} ${l.message}`
					: l.message,
			)
			.join("\n");

		const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		const sanitizedName = (
			service.name ||
			service.appName ||
			"service"
		).replace(/[^a-zA-Z0-9_-]/g, "_");
		const shortId = containerId ? containerId.slice(0, 10) : "logs";
		const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		a.href = url;
		a.download = `${sanitizedName}-${shortId}-${dateStr}.log`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		toast.success("Log file downloaded");
	};

	// Clear logs
	const handleClear = () => {
		setRawLogs("");
		setMessageBuffer([]);
		toast.info("Logs cleared from viewer");
	};

	// Level filter helper
	const toggleLevel = (lvl: LogType) => {
		setSelectedLevels((prev) =>
			prev.includes(lvl) ? prev.filter((l) => l !== lvl) : [...prev, lvl],
		);
	};

	const selectedContainer = containers?.find(
		(c) => c.containerId === containerId,
	);
	const selectedContainerStatus = getStatusBadge(
		selectedContainer && "state" in selectedContainer
			? selectedContainer.state
			: undefined,
	);

	return (
		<div
			className={cn(
				"relative flex flex-col rounded-xl border border-[#2b2738] bg-[#0e0c15] text-[#ede9f6] shadow-2xl overflow-hidden",
				className,
			)}
		>
			{/* Top Container Picker and Settings Bar */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#14121e] px-4 py-3">
				{/* Container selector */}
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-2">
						<SquareTerminal className="size-4 text-[#8f8a9d]" />
						<span className="text-xs font-medium text-[#8f8a9d]">
							Container
						</span>
					</div>

					<div className="flex items-center gap-2">
						<Select value={containerId} onValueChange={setContainerId}>
							<SelectTrigger className="h-9 min-w-[220px] max-w-[360px] border-white/10 bg-[#1b1827] text-xs font-mono text-[#dcd8e6] focus:ring-violet-500/40">
								{isContainersLoading ? (
									<div className="flex items-center gap-2">
										<Loader2 className="size-3.5 animate-spin text-violet-400" />
										<span className="text-xs font-sans text-[#8f8a9d]">
											Loading containers...
										</span>
									</div>
								) : selectedContainer ? (
									<div className="flex min-w-0 items-center gap-2 text-left">
										<span
											className={cn(
												"size-2 shrink-0 rounded-full",
												selectedContainerStatus.dot,
											)}
										/>
										<span className="truncate font-sans font-medium text-[#eae6f4]">
											{selectedContainer.name}
										</span>
										<span className="text-[11px] text-[#787486]">
											({selectedContainer.containerId.slice(0, 8)})
										</span>
									</div>
								) : (
									<SelectValue placeholder="Select container..." />
								)}
							</SelectTrigger>
							<SelectContent className="border-[#322e42] bg-[#161422] text-xs text-[#eae6f4]">
								<SelectGroup>
									{containers && containers.length > 0 ? (
										containers.map((c) => {
											const badgeInfo = getStatusBadge(c.state);
											return (
												<SelectItem
													key={c.containerId}
													value={c.containerId}
													className="font-mono text-xs focus:bg-white/[0.07] focus:text-white"
												>
													<div className="flex items-center gap-2">
														<span
															className={cn(
																"size-2 shrink-0 rounded-full",
																badgeInfo.dot,
															)}
														/>
														<span className="font-sans font-medium text-[#e3dfee]">
															{c.name}
														</span>
														<span className="text-[11px] text-[#868294]">
															({c.containerId.slice(0, 10)})
														</span>
														<Badge
															variant="outline"
															className={cn(
																"ml-2 text-[10px] px-1.5 py-0",
																badgeInfo.badge,
															)}
														>
															{c.state}
														</Badge>
													</div>
												</SelectItem>
											);
										})
									) : (
										<div className="p-3 text-center text-xs text-[#827d91]">
											No containers running
										</div>
									)}
									<SelectLabel className="text-[11px] text-[#6b677a]">
										Containers ({containers?.length || 0})
									</SelectLabel>
								</SelectGroup>
							</SelectContent>
						</Select>

						<TooltipProvider delayDuration={200}>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-8 border border-white/10 bg-[#1b1827] text-[#9b97a7] hover:bg-white/[0.08] hover:text-white"
										onClick={() => {
											if (runType === "native") refetchNative();
											else refetchSwarm();
											toast.info("Refreshed containers list");
										}}
									>
										<RotateCcw
											className={cn(
												"size-3.5",
												isContainersLoading && "animate-spin text-violet-400",
											)}
										/>
									</Button>
								</TooltipTrigger>
								<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
									Refresh containers
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>

					{/* Swarm / Native toggle for applications */}
					{isApplication && (
						<div className="flex items-center rounded-lg border border-white/10 bg-[#1b1827] p-0.5 text-xs">
							<button
								type="button"
								onClick={() => setRunType("native")}
								className={cn(
									"rounded px-2.5 py-1 text-xs font-medium transition-colors",
									runType === "native"
										? "bg-violet-600/30 text-violet-200 shadow-xs"
										: "text-[#878395] hover:text-white",
								)}
							>
								Native
							</button>
							<button
								type="button"
								onClick={() => setRunType("swarm")}
								className={cn(
									"rounded px-2.5 py-1 text-xs font-medium transition-colors",
									runType === "swarm"
										? "bg-violet-600/30 text-violet-200 shadow-xs"
										: "text-[#878395] hover:text-white",
								)}
							>
								Swarm
							</button>
						</div>
					)}
				</div>

				{/* Stream Status / Quick Controls */}
				<div className="flex items-center gap-2">
					{isWsConnecting && (
						<div className="flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300">
							<Loader2 className="size-3 animate-spin" />
							<span>Connecting stream...</span>
						</div>
					)}

					{isPaused && (
						<div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
							<Pause className="size-3" />
							<span>
								Paused{" "}
								{messageBuffer.length > 0 &&
									`(${messageBuffer.length} buffered)`}
							</span>
						</div>
					)}

					<Button
						variant="outline"
						size="sm"
						onClick={handleTogglePause}
						className={cn(
							"h-8 gap-1.5 border-white/10 text-xs font-medium transition-colors",
							isPaused
								? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
								: "bg-[#1b1827] text-[#c9c5d5] hover:bg-white/[0.08] hover:text-white",
						)}
					>
						{isPaused ? (
							<Play className="size-3.5" />
						) : (
							<Pause className="size-3.5" />
						)}
						<span className="hidden sm:inline">
							{isPaused ? "Resume" : "Pause"}
						</span>
					</Button>

					<AnalyzeLogs logs={filteredLogs} context="runtime" />
				</div>
			</div>

			{/* Second Toolbar: Search, Filters, Line Count, Since, Actions */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-[#110f1a] px-4 py-2.5">
				{/* Search box with real-time match counter */}
				<div className="relative flex flex-1 min-w-[200px] max-w-sm items-center">
					<Search className="absolute left-2.5 size-3.5 text-[#736f81]" />
					<Input
						type="search"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search logs..."
						className="h-8 pl-8 pr-16 text-xs bg-[#181524] border-white/10 text-[#dedae9] placeholder:text-[#6d697b] focus:border-violet-500/50"
					/>
					{search && (
						<div className="absolute right-2 flex items-center gap-1.5">
							<span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-[#a5a1b3]">
								{filteredLogs.length}
							</span>
							<button
								type="button"
								onClick={() => setSearch("")}
								className="text-[#8e8a9d] hover:text-white"
							>
								<X className="size-3" />
							</button>
						</div>
					)}
				</div>

				{/* Filter Toolbar Items */}
				<div className="flex flex-wrap items-center gap-2">
					{/* Log Level Filter Dropdown */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className={cn(
									"h-8 gap-1.5 border-white/10 bg-[#181524] text-xs font-normal text-[#c7c3d4] hover:bg-white/[0.08] hover:text-white",
									selectedLevels.length > 0 &&
										"border-violet-500/50 bg-violet-950/30 text-violet-200",
								)}
							>
								<ListFilter className="size-3.5 text-[#888496]" />
								<span>
									{selectedLevels.length === 0
										? "Levels: All"
										: `Levels (${selectedLevels.length})`}
								</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-52 border-[#332f42] bg-[#161422] text-xs text-[#dcd8e6]">
							<DropdownMenuLabel className="flex items-center justify-between text-[11px] text-[#868294]">
								<span>Filter by Log Level</span>
								{selectedLevels.length > 0 && (
									<button
										type="button"
										onClick={() => setSelectedLevels([])}
										className="text-violet-400 hover:underline"
									>
										Reset
									</button>
								)}
							</DropdownMenuLabel>
							<DropdownMenuSeparator className="bg-white/10" />
							<DropdownMenuCheckboxItem
								checked={selectedLevels.length === 0}
								onCheckedChange={() => setSelectedLevels([])}
								className="text-xs"
							>
								<span>All Levels</span>
								<span className="ml-auto font-mono text-[10px] text-[#777385]">
									{parsedLogs.length}
								</span>
							</DropdownMenuCheckboxItem>
							{LOG_LEVELS.map((lvl) => (
								<DropdownMenuCheckboxItem
									key={lvl.value}
									checked={selectedLevels.includes(lvl.value)}
									onCheckedChange={() => toggleLevel(lvl.value)}
									className="text-xs"
								>
									<span className={cn("font-medium", lvl.color)}>
										{lvl.label}
									</span>
									<span className="ml-auto font-mono text-[10px] text-[#777385]">
										{levelCounts[lvl.value]}
									</span>
								</DropdownMenuCheckboxItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					{/* Lines Selector Dropdown */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-8 gap-1.5 border-white/10 bg-[#181524] text-xs font-normal text-[#c7c3d4] hover:bg-white/[0.08] hover:text-white"
							>
								<Hash className="size-3.5 text-[#888496]" />
								<span>{lines} lines</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-40 border-[#332f42] bg-[#161422] text-xs text-[#dcd8e6]">
							<DropdownMenuLabel className="text-[11px] text-[#868294]">
								Line buffer limit
							</DropdownMenuLabel>
							<DropdownMenuSeparator className="bg-white/10" />
							<DropdownMenuRadioGroup
								value={lines.toString()}
								onValueChange={(val) => setLines(Number(val))}
							>
								{LINE_LIMIT_OPTIONS.map((num) => (
									<DropdownMenuRadioItem
										key={num}
										value={num.toString()}
										className="text-xs"
									>
										{num} lines
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					{/* Time filter (Since) Dropdown */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-8 gap-1.5 border-white/10 bg-[#181524] text-xs font-normal text-[#c7c3d4] hover:bg-white/[0.08] hover:text-white"
							>
								<Clock className="size-3.5 text-[#888496]" />
								<span>
									{TIME_FILTER_OPTIONS.find((t) => t.value === since)?.label ||
										since}
								</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-44 border-[#332f42] bg-[#161422] text-xs text-[#dcd8e6]">
							<DropdownMenuLabel className="text-[11px] text-[#868294]">
								Time range (since)
							</DropdownMenuLabel>
							<DropdownMenuSeparator className="bg-white/10" />
							<DropdownMenuRadioGroup
								value={since}
								onValueChange={(val) => setSince(val as RailwayTimeFilter)}
							>
								{TIME_FILTER_OPTIONS.map((opt) => (
									<DropdownMenuRadioItem
										key={opt.value}
										value={opt.value}
										className="text-xs"
									>
										{opt.label}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					{/* Wrap Lines Toggle */}
					<TooltipProvider delayDuration={200}>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={() => setWrapLines((w) => !w)}
									className={cn(
										"size-8 border-white/10 bg-[#181524] text-[#c7c3d4] hover:bg-white/[0.08] hover:text-white",
										wrapLines &&
											"border-violet-500/40 bg-violet-950/30 text-violet-300",
									)}
								>
									<WrapText className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
								{wrapLines ? "Line wrap: ON" : "Line wrap: OFF"}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					{/* Show Timestamps Toggle */}
					<TooltipProvider delayDuration={200}>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={() => setShowTimestamp((t) => !t)}
									className={cn(
										"size-8 border-white/10 bg-[#181524] text-[#c7c3d4] hover:bg-white/[0.08] hover:text-white",
										showTimestamp &&
											"border-violet-500/40 bg-violet-950/30 text-violet-300",
									)}
								>
									<Clock className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
								{showTimestamp ? "Timestamps: Visible" : "Timestamps: Hidden"}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					{/* Clear logs */}
					<TooltipProvider delayDuration={200}>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={handleClear}
									disabled={filteredLogs.length === 0}
									className="size-8 border-white/10 bg-[#181524] text-[#c7c3d4] hover:bg-rose-950/30 hover:text-rose-300 hover:border-rose-500/30"
								>
									<Trash2 className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
								Clear logs view
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					{/* Copy logs */}
					<TooltipProvider delayDuration={200}>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={handleCopy}
									disabled={filteredLogs.length === 0}
									className="size-8 border-white/10 bg-[#181524] text-[#c7c3d4] hover:bg-white/[0.08] hover:text-white"
								>
									{copied ? (
										<Check className="size-3.5 text-emerald-400" />
									) : (
										<Copy className="size-3.5" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
								{copied ? "Copied!" : "Copy visible logs"}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					{/* Download logs */}
					<TooltipProvider delayDuration={200}>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={handleDownload}
									disabled={filteredLogs.length === 0}
									className="size-8 border-white/10 bg-[#181524] text-[#c7c3d4] hover:bg-white/[0.08] hover:text-white"
								>
									<Download className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent className="border-[#332f42] bg-[#1a1727] text-xs">
								Download logs (.log)
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>

			{/* Terminal Area */}
			<div className="relative flex-1 bg-[#0b0914] min-h-[480px]">
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="h-[640px] max-h-[70vh] overflow-y-auto custom-logs-scrollbar divide-y divide-white/[0.02]"
				>
					{filteredLogs.length > 0 ? (
						filteredLogs.map((log, index) => (
							<LogLineRenderer
								key={`${log.rawTimestamp ?? ""}-${index}`}
								log={log}
								index={index}
								showTimestamp={showTimestamp}
								searchTerm={search}
								wrapLines={wrapLines}
							/>
						))
					) : isWsConnecting || isContainersLoading ? (
						<div className="flex h-full min-h-[380px] flex-col items-center justify-center gap-3 text-[#7f7a8d]">
							<Loader2 className="size-7 animate-spin text-violet-400" />
							<p className="text-sm font-medium">Connecting to log stream...</p>
							<p className="text-xs text-[#5e5a6a]">
								Streaming Docker container runtime logs
							</p>
						</div>
					) : containerId ? (
						<div className="flex h-full min-h-[380px] flex-col items-center justify-center gap-2.5 text-[#7f7a8d] px-6 text-center">
							<SquareTerminal className="size-8 text-[#4e4a5b]" />
							<p className="text-sm font-medium text-[#b5b1c3]">
								{search || selectedLevels.length > 0
									? "No logs match the current filters"
									: "No logs found for this container"}
							</p>
							<p className="text-xs text-[#635f72] max-w-sm">
								{search || selectedLevels.length > 0
									? "Try adjusting your search term, line limit, or log level filters."
									: "Logs generated by this container will appear here in real-time."}
							</p>
							{(search || selectedLevels.length > 0) && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setSearch("");
										setSelectedLevels([]);
									}}
									className="mt-2 h-7 border-white/10 text-xs bg-[#191626] text-[#b5b1c3]"
								>
									Clear filters
								</Button>
							)}
						</div>
					) : (
						<div className="flex h-full min-h-[380px] flex-col items-center justify-center gap-3 text-[#7f7a8d] px-8 text-center">
							<Layers className="size-9 text-[#4e4a5b]" />
							<p className="text-base font-medium text-[#c4c0d2]">
								No container selected or running
							</p>
							<p className="text-xs text-[#6e6a7c] max-w-md">
								Ensure the service is deployed and has active containers to view
								live logs.
							</p>
						</div>
					)}
				</div>

				{/* Floating "Scroll to Bottom" button */}
				{showScrollButton && (
					<button
						type="button"
						onClick={scrollToBottom}
						className="absolute bottom-5 right-6 z-30 flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-600/90 px-3.5 py-1.5 text-xs font-medium text-white shadow-xl shadow-black/50 backdrop-blur transition-all hover:bg-violet-500 hover:scale-105"
					>
						<ArrowDown className="size-3.5 animate-bounce" />
						<span>Scroll to bottom</span>
					</button>
				)}
			</div>

			{/* Terminal Footer Status Bar */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#12101c] px-4 py-2 text-[11px] text-[#7e7a8c]">
				<div className="flex items-center gap-3">
					<span>
						Lines displayed:{" "}
						<strong className="font-mono text-[#cdc9d8]">
							{filteredLogs.length}
						</strong>
						{parsedLogs.length !== filteredLogs.length && (
							<span className="text-[#656172]">
								{" "}
								(of {parsedLogs.length} total)
							</span>
						)}
					</span>
					<span>•</span>
					<span>
						Container:{" "}
						<strong className="font-mono text-[#cdc9d8]">
							{selectedContainer?.name || containerId?.slice(0, 12) || "None"}
						</strong>
					</span>
				</div>

				<div className="flex items-center gap-2">
					<span
						className={cn(
							"size-1.5 rounded-full",
							containerId ? "bg-emerald-400 animate-pulse" : "bg-[#555163]",
						)}
					/>
					<span>{containerId ? "WebSocket Live" : "Disconnected"}</span>
				</div>
			</div>
		</div>
	);
};

export default RailwayLogs;
