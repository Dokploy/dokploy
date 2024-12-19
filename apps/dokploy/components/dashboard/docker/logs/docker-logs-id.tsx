import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { Download as DownloadIcon, Loader2 } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { LineCountFilter } from "./line-count-filter";
import { SinceLogsFilter, type TimeFilter } from "./since-logs-filter";
import { StatusLogsFilter } from "./status-logs-filter";
import { TerminalLine } from "./terminal-line";
import { type LogLine, getLogType, parseLogs } from "./utils";

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
	const scrollRef = useRef<HTMLDivElement>(null);
	const [isLoading, setIsLoading] = React.useState(false);

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
		setLines(lines);
	};

	const handleSince = (value: TimeFilter) => {
		setRawLogs("");
		setFilteredLogs([]);
		setSince(value);
	};

	useEffect(() => {
		if (!containerId) return;

		let isCurrentConnection = true;
		let noDataTimeout: NodeJS.Timeout;
		setIsLoading(true);
		setRawLogs("");
		setFilteredLogs([]);

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
		console.log("Connecting to WebSocket:", wsUrl);
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
			console.log("WebSocket connected");
			resetNoDataTimeout();
		};

		ws.onmessage = (e) => {
			if (!isCurrentConnection) return;
			setRawLogs((prev) => prev + e.data);
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

	const handleFilter = (logs: LogLine[]) => {
		return logs.filter((log) => {
			const logType = getLogType(log.message).type;

			if (typeFilter.length === 0) {
				return true;
			}

			return typeFilter.includes(logType);
		});
	};

	useEffect(() => {
		setRawLogs("");
		setFilteredLogs([]);
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

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-lg overflow-hidden">
				<div className="space-y-4">
					<div className="flex flex-wrap justify-between items-start sm:items-center gap-4">
						<div className="flex flex-wrap gap-4">
							<LineCountFilter value={lines} onValueChange={handleLines} />

							<SinceLogsFilter
								value={since}
								onValueChange={handleSince}
								showTimestamp={showTimestamp}
								onTimestampChange={setShowTimestamp}
							/>

							<StatusLogsFilter
								value={typeFilter}
								setValue={setTypeFilter}
								title="Log type"
								options={priorities}
							/>

							<Input
								type="search"
								placeholder="Search logs..."
								value={search}
								onChange={handleSearch}
								className="inline-flex h-9 text-sm placeholder-gray-400 w-full sm:w-auto"
							/>
						</div>

						<Button
							variant="outline"
							size="sm"
							className="h-9 sm:w-auto w-full"
							onClick={handleDownload}
							disabled={filteredLogs.length === 0 || !data?.Name}
						>
							<DownloadIcon className="mr-2 h-4 w-4" />
							Download logs
						</Button>
					</div>
					<div
						ref={scrollRef}
						onScroll={handleScroll}
						className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-[#fafafa] dark:bg-[#050506] rounded custom-logs-scrollbar"
					>
						{filteredLogs.length > 0 ? (
							filteredLogs.map((filteredLog: LogLine, index: number) => (
								<TerminalLine
									key={index}
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
		</div>
	);
};
