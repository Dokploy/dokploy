import copy from "copy-to-clipboard";
import {
	Check,
	Copy,
	Download as DownloadIcon,
	Loader2,
	Pause,
	Play,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { useEffect, useMemo, useRef } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export const DockerLogsId: React.FC<Props> = ({
	containerId,
	serverId,
	runType,
}) => {
	const t = useTranslations("dockerLogs");
	const priorities = useMemo(
		() => [
			{ label: t("priority_info"), value: "info" },
			{ label: t("priority_success"), value: "success" },
			{ label: t("priority_warning"), value: "warning" },
			{ label: t("priority_debug"), value: "debug" },
			{ label: t("priority_error"), value: "error" },
		],
		[t],
	);
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

	const handleLines = (nextLines: number) => {
		setRawLogs("");
		setFilteredLogs([]);
		setMessageBuffer([]);
		setLines(nextLines);
	};

	const handleSince = (value: TimeFilter) => {
		setRawLogs("");
		setFilteredLogs([]);
		setMessageBuffer([]);
		setSince(value);
	};

	const handlePauseResume = () => {
		if (isPaused) {
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
			}, 2000);
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
				setMessageBuffer((prev) => [...prev, e.data]);
			} else {
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

		ws.onerror = () => {
			if (!isCurrentConnection) return;
			setIsLoading(false);
			if (noDataTimeout) clearTimeout(noDataTimeout);
		};

		ws.onclose = () => {
			if (!isCurrentConnection) return;
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
	}, [containerId, serverId, lines, search, since, runType]);

	const handleDownload = () => {
		const logContent = filteredLogs
			.map(
				({ timestamp, message }: { timestamp: Date | null; message: string }) =>
					`${timestamp?.toISOString() || t("noTimestamp")} ${message}`,
			)
			.join("\n");

		const blob = new Blob([logContent], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		const appName = data?.Name.replace("/", "") || "app";
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
						? `${timestamp?.toISOString() || t("noTimestamp")} ${message}`
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

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-lg">
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
								title={t("logType")}
								allLabel={t("allTypes")}
								options={priorities}
							/>

							<Input
								type="search"
								placeholder={t("searchPlaceholder")}
								value={search}
								onChange={handleSearch}
								className="inline-flex h-9 text-sm placeholder-gray-400 w-full sm:w-auto"
							/>
						</div>

						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								className="h-9"
								onClick={handlePauseResume}
								title={isPaused ? t("resumeLogsTitle") : t("pauseLogsTitle")}
							>
								{isPaused ? (
									<Play className="mr-2 h-4 w-4" />
								) : (
									<Pause className="mr-2 h-4 w-4" />
								)}
								{isPaused ? t("resume") : t("pause")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="h-9"
								onClick={handleCopy}
								disabled={filteredLogs.length === 0}
								title={t("copyTitle")}
							>
								{copied ? (
									<Check className="mr-2 h-4 w-4" />
								) : (
									<Copy className="mr-2 h-4 w-4" />
								)}
								{t("copy")}
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="h-9 sm:w-auto w-full"
								onClick={handleDownload}
								disabled={filteredLogs.length === 0 || !data?.Name}
							>
								<DownloadIcon className="mr-2 h-4 w-4" />
								{t("downloadLogs")}
							</Button>
						</div>
					</div>
					{isPaused && (
						<AlertBlock type="warning">
							<div className="flex items-center gap-2">
								<Pause className="h-4 w-4" />
								<span>
									{t("logsPaused")}
									{messageBuffer.length > 0 && (
										<span className="ml-1 font-medium">
											{t("messagesBuffered", {
												count: messageBuffer.length,
											})}
										</span>
									)}
								</span>
							</div>
						</AlertBlock>
					)}
					<div
						ref={scrollRef}
						onScroll={handleScroll}
						className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-muted/30 dark:bg-muted/20 rounded custom-logs-scrollbar"
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
								{t("noLogsFound")}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
