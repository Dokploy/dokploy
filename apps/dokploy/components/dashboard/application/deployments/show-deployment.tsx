import copy from "copy-to-clipboard";
import { Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnalyzeLogs } from "@/components/dashboard/docker/logs/analyze-logs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { TerminalLine } from "../../docker/logs/terminal-line";
import { type LogLine, parseLogs } from "../../docker/logs/utils";

interface Props {
	logPath: string | null;
	open: boolean;
	onClose: () => void;
	serverId?: string;
	errorMessage?: string;
}
export const ShowDeployment = ({
	logPath,
	open,
	onClose,
	serverId,
	errorMessage,
}: Props) => {
	const [data, setData] = useState("");
	const [showExtraLogs, setShowExtraLogs] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const wsRef = useRef<WebSocket | null>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [copied, setCopied] = useState(false);

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

	useEffect(() => {
		if (!open || !logPath) return;

		setData("");
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/listen-deployment?logPath=${logPath}${serverId ? `&serverId=${serverId}` : ""}`;
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws; // Store WebSocket instance in ref

		ws.onmessage = (e) => {
			setData((currentData) => currentData + e.data);
		};

		ws.onerror = (error) => {
			console.error("WebSocket error: ", error);
		};

		ws.onclose = () => {
			wsRef.current = null; // Clear reference on close
		};

		return () => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				ws.close();
				wsRef.current = null;
			}
		};
	}, [logPath, open]);

	useEffect(() => {
		const logs = parseLogs(data);
		let filteredLogsResult = logs;
		if (serverId) {
			let hideSubsequentLogs = false;
			filteredLogsResult = logs.filter((log) => {
				if (
					log.message.includes(
						"===================================EXTRA LOGS============================================",
					)
				) {
					hideSubsequentLogs = true;
					return showExtraLogs;
				}
				return showExtraLogs ? true : !hideSubsequentLogs;
			});
		}

		setFilteredLogs(filteredLogsResult);
	}, [data, showExtraLogs]);

	useEffect(() => {
		scrollToBottom();

		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [filteredLogs, autoScroll]);

	const handleCopy = () => {
		const logContent = filteredLogs
			.map(({ timestamp, message }: LogLine) =>
				`${timestamp?.toISOString() || ""} ${message}`.trim(),
			)
			.join("\n");

		const success = copy(logContent);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const optionalErrors = parseLogs(errorMessage || "");

	return (
		<Dialog
			open={open}
			onOpenChange={(e) => {
				onClose();
				if (!e) {
					setData("");
				}

				if (wsRef.current) {
					if (wsRef.current.readyState === WebSocket.OPEN) {
						wsRef.current.close();
					}
				}
			}}
		>
			<DialogContent className={"sm:max-w-5xl flex flex-col max-h-[95vh]"}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 flex-wrap">
						<span>Deployment</span>
						<Badge variant="blank" className="text-xs">
							{filteredLogs.length} lines
						</Badge>
					</DialogTitle>
					<DialogDescription>
						See all the details of this deployment.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="h-9 flex-1 sm:flex-initial"
						onClick={handleCopy}
						disabled={filteredLogs.length === 0}
					>
						{copied ? (
							<Check className="h-3.5 w-3.5" />
						) : (
							<Copy className="h-3.5 w-3.5" />
						)}
						<span className="ml-1.5">Copy</span>
					</Button>
					<div className="flex-1 sm:flex-initial [&>button]:w-full sm:[&>button]:w-auto">
						<AnalyzeLogs logs={filteredLogs} context="build" />
					</div>

					{serverId && (
						<label
							htmlFor="show-extra-logs"
							className="flex items-center gap-2 text-sm font-medium leading-none px-3 h-9 rounded-md border bg-background w-full sm:w-auto"
						>
							<Checkbox
								id="show-extra-logs"
								checked={showExtraLogs}
								onCheckedChange={(checked) =>
									setShowExtraLogs(checked as boolean)
								}
							/>
							Show Extra Logs
						</label>
					)}
				</div>

				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="h-[60vh] sm:h-[720px] flex-1 min-h-0 overflow-y-auto space-y-0 border p-3 sm:p-4 bg-[#fafafa] dark:bg-[#050506] rounded custom-logs-scrollbar text-xs sm:text-sm"
				>
					{" "}
					{filteredLogs.length > 0 ? (
						filteredLogs.map((log: LogLine, index: number) => (
							<TerminalLine
								key={`${log.rawTimestamp ?? ""}-${index}`}
								log={log}
								noTimestamp
							/>
						))
					) : (
						<>
							{optionalErrors.length > 0 ? (
								optionalErrors.map((log: LogLine, index: number) => (
									<TerminalLine
										key={`extra-${log.rawTimestamp ?? ""}-${index}`}
										log={log}
										noTimestamp
									/>
								))
							) : (
								<div className="flex justify-center items-center h-full text-muted-foreground">
									<Loader2 className="h-6 w-6 animate-spin" />
								</div>
							)}
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
