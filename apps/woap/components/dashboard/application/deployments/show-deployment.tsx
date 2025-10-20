import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
	const wsRef = useRef<WebSocket | null>(null); // Ref to hold WebSocket instance
	const [autoScroll, setAutoScroll] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);

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
			<DialogContent className={"sm:max-w-5xl"}>
				<DialogHeader>
					<DialogTitle>Deployment</DialogTitle>
					<DialogDescription className="flex items-center gap-2">
						<span>
							See all the details of this deployment |{" "}
							<Badge variant="blank" className="text-xs">
								{filteredLogs.length} lines
							</Badge>
						</span>

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

				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-[#fafafa] dark:bg-[#050506] rounded custom-logs-scrollbar"
				>
					{" "}
					{filteredLogs.length > 0 ? (
						filteredLogs.map((log: LogLine, index: number) => (
							<TerminalLine key={index} log={log} noTimestamp />
						))
					) : (
						<>
							{optionalErrors.length > 0 ? (
								optionalErrors.map((log: LogLine, index: number) => (
									<TerminalLine key={`extra-${index}`} log={log} noTimestamp />
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
