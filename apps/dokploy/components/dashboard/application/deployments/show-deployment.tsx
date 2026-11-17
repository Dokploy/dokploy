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
import {
	keepLastLines,
	type LogLine,
	MAX_DEPLOYMENT_LOG_LINES,
	parseLogs,
} from "../../docker/logs/utils";
import { VirtualLogList } from "../../docker/logs/virtual-log-list";

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
	const [trimmedLines, setTrimmedLines] = useState(0);
	const dataRef = useRef("");
	const [showExtraLogs, setShowExtraLogs] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const wsRef = useRef<WebSocket | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!open || !logPath) return;

		dataRef.current = "";
		setData("");
		setTrimmedLines(0);
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/listen-deployment?logPath=${logPath}${serverId ? `&serverId=${serverId}` : ""}`;
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws; // Store WebSocket instance in ref

		ws.onmessage = (e) => {
			const { text, trimmed } = keepLastLines(
				dataRef.current + e.data,
				MAX_DEPLOYMENT_LOG_LINES,
			);
			dataRef.current = text;
			setData(text);
			if (trimmed > 0) {
				setTrimmedLines((total) => total + trimmed);
			}
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
					dataRef.current = "";
					setData("");
					setTrimmedLines(0);
				}

				if (wsRef.current) {
					if (wsRef.current.readyState === WebSocket.OPEN) {
						wsRef.current.close();
					}
				}
			}}
		>
			<DialogContent className={"sm:max-w-5xl"}>
				<DialogHeader>
					<DialogTitle>Deployment</DialogTitle>
					<DialogDescription className="flex items-center gap-2">
						<span className="flex items-center gap-2">
							See all the details of this deployment |{" "}
							<Badge variant="blank" className="text-xs tabular-nums">
								{filteredLogs.length} lines
							</Badge>
						</span>

						<Button
							variant="outline"
							size="sm"
							className="h-7"
							onClick={handleCopy}
							disabled={filteredLogs.length === 0}
						>
							{copied ? (
								<Check className="h-3.5 w-3.5" />
							) : (
								<Copy className="h-3.5 w-3.5" />
							)}
						</Button>
						<AnalyzeLogs logs={filteredLogs} context="build" />

						{serverId && (
							<div className="flex items-center space-x-2">
								<Checkbox
									id="show-extra-logs"
									checked={showExtraLogs}
									onCheckedChange={(checked) =>
										setShowExtraLogs(checked as boolean)
									}
								/>
								<label
									htmlFor="show-extra-logs"
									className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
								>
									Show Extra Logs
								</label>
							</div>
						)}
					</DialogDescription>
				</DialogHeader>

				{trimmedLines > 0 && (
					<p className="text-xs text-muted-foreground">
						Showing the last {MAX_DEPLOYMENT_LOG_LINES} lines; {trimmedLines}{" "}
						older lines are hidden here. The full log is kept on the server.
					</p>
				)}

				<VirtualLogList
					logs={filteredLogs.length > 0 ? filteredLogs : optionalErrors}
					noTimestamp
					className="h-[720px] bg-background"
				>
					<div className="flex justify-center items-center h-full text-muted-foreground">
						<Loader2 className="h-6 w-6 animate-spin" />
					</div>
				</VirtualLogList>
			</DialogContent>
		</Dialog>
	);
};
