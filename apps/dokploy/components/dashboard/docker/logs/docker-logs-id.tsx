import copy from "copy-to-clipboard";
import {
	Check,
	Copy,
	Download as DownloadIcon,
	Filter,
	Loader2,
	Pause,
	Play,
	Search,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { api } from "@/utils/api";
import { LineCountFilter } from "./line-count-filter";
import { SinceLogsFilter, type TimeFilter } from "./since-logs-filter";
import { StatusLogsFilter } from "./status-logs-filter";
import { TerminalLine } from "./terminal-line";
import { getLogType, type LogLine, parseLogs } from "./utils";

interface Props {
	containerId: string;
	serverId?: string | null;
	runType: "swarm" | "native";
}

export const priorities = [
	{
		label: "Info",
		value: "info",
	},
	{
		label: "Success",
		value: "success",
	},
	{
		label: "Warning",
		value: "warning",
	},
	{
		label: "Debug",
		value: "debug",
	},
	{
		label: "Error",
		value: "error",
	},
];

export const DockerLogsId: React.FC<Props> = ({
	containerId,
	serverId,
	runType,
}) => {
	const { data } = api.docker.getConfig.useQuery(
		{
			containerId,
			serverId: serverId ?? undefined,
		},
		{
			enabled: !!containerId,
		},
	);

	const [rawLogs, setRawLogs] = React.useState("");
	const [filteredLogs, setFilteredLogs] = React.useState<LogLine[]>([]);
	const [autoScroll, setAutoScroll] = React.useState(true);
	const [lines, setLines] = React.useState<number>(100);
	const [search, setSearch] = React.useState<string>("");
	const [showTimestamp, setShowTimestamp] = React.useState(true);
	const [since, setSince] = React.useState<TimeFilter>("all");
	const [typeFilter, setTypeFilter] = React.useState<string[]>([]);
	const [isPaused, setIsPaused] = React.useState(false);
	const [messageBuffer, setMessageBuffer] = React.useState<string[]>([]);
	const isPausedRef = useRef(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [isLoading, setIsLoading] = React.useState(false);
	const [copied, setCopied] = React.useState(false);

	const scrollToBottom = () => {
		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	};

	const handleScroll = () => {
		if (!scrollRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
		setAutoScroll(isAtBottom);
	};

	const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearch(e.target.value || "");
	};

	const handleLines = (lines: number) => {
		setRawLogs("");
		setFilteredLogs([]);
		setMessageBuffer([]);
		setLines(lines);
	};

	const handleSince = (value: TimeFilter) => {
		setRawLogs("");
		setFilteredLogs([]);
		setMessageBuffer([]);
		setSince(value);
	};

	const handlePauseResume = () => {
		if (isPaused) {
			// Resume: Apply all buffered messages
			if (messageBuffer.length > 0) {
				const bufferedContent = messageBuffer.join("");
				setRawLogs((prev) => {
					const updated = prev + bufferedContent;
					const splitLines = updated.split("\n");
					if (splitLines.length > lines) {
						return splitLines.slice(-lines).join("\n");
					}
					return updated;
				});
				setMessageBuffer([]);
			}
		}
		const newPausedState = !isPaused;
		setIsPaused(newPausedState);
		isPausedRef.current = newPausedState;
	};

	useEffect(() => {
		if (!containerId) return;

		let isCurrentConnection = true;
		let noDataTimeout: NodeJS.Timeout;
		setIsLoading(true);
		setRawLogs("");
		setFilteredLogs([]);
		setMessageBuffer([]);
		// Reset pause state when container changes
		setIsPaused(false);
		isPausedRef.current = false;

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const params = new globalThis.URLSearchParams({
			containerId,
			tail: lines.toString(),
			since,
			search,
			runType,
		});

		if (serverId) {
			params.append("serverId", serverId);
		}

		const wsUrl = `${protocol}//${
			window.location.host
		}/docker-container-logs?${params.toString()}`;
		const ws = new WebSocket(wsUrl);

		const resetNoDataTimeout = () => {
			if (noDataTimeout) clearTimeout(noDataTimeout);
			noDataTimeout = setTimeout(() => {
				if (isCurrentConnection) {
					setIsLoading(false);
				}
			}, 2000); // Wait 2 seconds for data before showing "No logs found"
		};

		ws.onopen = () => {
			if (!isCurrentConnection) {
				ws.close();
				return;
			}
			resetNoDataTimeout();
		};

		ws.onmessage = (e) => {
			if (!isCurrentConnection) return;

			if (isPausedRef.current) {
				// When paused, buffer the messages instead of displaying them
				setMessageBuffer((prev) => [...prev, e.data]);
			} else {
				// When not paused, display messages normally
				setRawLogs((prev) => {
					const updated = prev + e.data;
					const splitLines = updated.split("\n");
					if (splitLines.length > lines) {
						return splitLines.slice(-lines).join("\n");
					}
					return updated;
				});
			}

			setIsLoading(false);
			if (noDataTimeout) clearTimeout(noDataTimeout);
		};

		ws.onerror = (error) => {
			if (!isCurrentConnection) return;
			console.error("WebSocket error:", error);
			setIsLoading(false);
			if (noDataTimeout) clearTimeout(noDataTimeout);
		};

		ws.onclose = (e) => {
			if (!isCurrentConnection) return;
			console.log("WebSocket closed:", e.reason);
			setIsLoading(false);
			if (noDataTimeout) clearTimeout(noDataTimeout);
		};

		return () => {
			isCurrentConnection = false;
			if (noDataTimeout) clearTimeout(noDataTimeout);
			if (ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
		};
	}, [containerId, serverId, lines, search, since]);

	const handleDownload = () => {
		const logContent = filteredLogs
			.map(
				({ timestamp, message }: { timestamp: Date | null; message: string }) =>
					`${timestamp?.toISOString() || "No timestamp"} ${message}`,
			)
			.join("\n");

		const blob = new Blob([logContent], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		const appName = data.Name.replace("/", "") || "app";
		const isoDate = new Date().toISOString();
		a.href = url;
		a.download = `${appName}-${isoDate.slice(0, 10).replace(/-/g, "")}_${isoDate
			.slice(11, 19)
			.replace(/:/g, "")}.log.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const handleCopy = async () => {
		const logContent = filteredLogs
			.map(
				({
					timestamp,
					message,
				}: {
					timestamp: Date | null;
					message: string;
				}) =>
					showTimestamp
						? `${timestamp?.toISOString() || "No timestamp"} ${message}`
						: message,
			)
			.join("\n");

		const success = copy(logContent);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const handleFilter = (logs: LogLine[]) => {
		return logs.filter((log) => {
			const logType = getLogType(log.message).type;

			if (typeFilter.length === 0) {
				return true;
			}

			return typeFilter.includes(logType);
		});
	};

	// Sync isPausedRef with isPaused state
	useEffect(() => {
		isPausedRef.current = isPaused;
	}, [isPaused]);

	useEffect(() => {
		setRawLogs("");
		setFilteredLogs([]);
		setMessageBuffer([]);
	}, [containerId]);

	useEffect(() => {
		const logs = parseLogs(rawLogs);
		const filtered = handleFilter(logs);
		setFilteredLogs(filtered);
	}, [rawLogs, search, lines, since, typeFilter]);

	useEffect(() => {
		scrollToBottom();

		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [filteredLogs, autoScroll]);

	const [showFilters, setShowFilters] = useState(false);
	const activeFilterCount =
		(typeFilter.length > 0 ? typeFilter.length : 0) +
		(lines !== "100" ? 1 : 0) +
		(since !== "1 hour" ? 1 : 0);

	return (
		<div className="flex flex-col gap-4">
			{/* Toolbar */}
			<div className="flex items-center gap-2">
				<div className="flex items-center flex-1 min-w-0 h-9 rounded-lg border border-input bg-transparent px-3 gap-2 focus-within:border-foreground/50 transition-colors">
					<Search className="size-4 text-muted-foreground shrink-0" />
					<input
						type="search"
						placeholder="Search logs..."
						value={search}
						onChange={handleSearch}
						className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
					/>
				</div>
				<Button
					variant="outline"
					size="sm"
					className={`h-9 relative ${showFilters ? "bg-accent" : ""}`}
					onClick={() => setShowFilters((v) => !v)}
				>
					<Filter className="h-4 w-4 mr-1.5" />
					Filters
					{activeFilterCount > 0 && (
						<span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
							{activeFilterCount}
						</span>
					)}
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-9"
					onClick={handlePauseResume}
					title={isPaused ? "Resume logs" : "Pause logs"}
				>
					{isPaused ? (
						<Play className="mr-1.5 h-3.5 w-3.5" />
					) : (
						<Pause className="mr-1.5 h-3.5 w-3.5" />
					)}
					<span className="hidden sm:inline">{isPaused ? "Resume" : "Pause"}</span>
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-9"
					onClick={handleCopy}
					disabled={filteredLogs.length === 0}
					title="Copy logs to clipboard"
				>
					{copied ? (
						<Check className="mr-1.5 h-3.5 w-3.5" />
					) : (
						<Copy className="mr-1.5 h-3.5 w-3.5" />
					)}
					<span className="hidden sm:inline">Copy</span>
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-9 hidden sm:inline-flex"
					onClick={handleDownload}
					disabled={filteredLogs.length === 0 || !data?.Name}
				>
					<DownloadIcon className="mr-1.5 h-3.5 w-3.5" />
					Download
				</Button>
			</div>

			{isPaused && (
				<div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
					<Pause className="h-4 w-4 shrink-0" />
					<span>
						Logs paused
						{messageBuffer.length > 0 && (
							<span className="ml-1 font-medium">
								({messageBuffer.length} messages buffered)
							</span>
						)}
					</span>
				</div>
			)}

			{/* Log viewer with filter panel */}
			<div className="flex overflow-hidden rounded-lg border">
				{/* Filter panel */}
				<div
					className={`shrink-0 overflow-hidden bg-card transition-all duration-200 ease-in-out ${
						showFilters ? "w-[260px] opacity-100 border-r" : "w-0 opacity-0"
					}`}
				>
					<div className="w-[260px] p-4 space-y-5 overflow-y-auto h-[720px]">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold">Filters</h3>
							{activeFilterCount > 0 && (
								<Button
									variant="ghost"
									size="sm"
									className="h-6 text-xs px-2"
									onClick={() => {
										handleLines("100");
										handleSince("1 hour");
										setTypeFilter([]);
										setShowTimestamp(false);
									}}
								>
									Clear all
								</Button>
							)}
						</div>

						<div className="space-y-2 [&_button]:w-full [&_button]:justify-between">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Lines
							</p>
							<LineCountFilter value={lines} onValueChange={handleLines} />
						</div>

						<div className="space-y-2 [&_button]:w-full [&_button]:justify-between">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Time range
							</p>
							<SinceLogsFilter
								value={since}
								onValueChange={handleSince}
								showTimestamp={showTimestamp}
								onTimestampChange={setShowTimestamp}
							/>
						</div>

						<div className="space-y-2 [&_button]:w-full [&_button]:justify-between">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Log type
							</p>
							<StatusLogsFilter
								value={typeFilter}
								setValue={setTypeFilter}
								title="Log type"
								options={priorities}
							/>
						</div>
					</div>
				</div>

				{/* Log content */}
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="flex-1 h-[720px] overflow-y-auto space-y-0 p-4 bg-[#fafafa] dark:bg-[#050506] custom-logs-scrollbar"
				>
					{filteredLogs.length > 0 ? (
						filteredLogs.map((filteredLog: LogLine, index: number) => (
							<TerminalLine
								key={`${filteredLog.rawTimestamp ?? ""}-${index}`}
								log={filteredLog}
								searchTerm={search}
								noTimestamp={!showTimestamp}
							/>
						))
					) : isLoading ? (
						<div className="flex justify-center items-center h-full text-muted-foreground">
							<Loader2 className="h-6 w-6 animate-spin" />
						</div>
					) : (
						<div className="flex justify-center items-center h-full text-muted-foreground">
							No logs found
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
