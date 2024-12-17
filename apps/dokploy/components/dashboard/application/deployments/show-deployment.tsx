import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useRef, useState } from "react";
import { TerminalLine } from "../../docker/logs/terminal-line";
import { LogLine, parseLogs } from "../../docker/logs/utils";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Props {
	logPath: string | null;
	open: boolean;
	onClose: () => void;
	serverId?: string;
}
export const ShowDeployment = ({ logPath, open, onClose, serverId }: Props) => {
	const [data, setData] = useState("");
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
		setFilteredLogs(logs);
	}, [data]);

	useEffect(() => {
		scrollToBottom();
	
		if (autoScroll && scrollRef.current) {
		  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	  }, [filteredLogs, autoScroll]);


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
			<DialogContent className={"sm:max-w-5xl overflow-y-auto max-h-screen"}>
				<DialogHeader>
					<DialogTitle>Deployment</DialogTitle>
					<DialogDescription>
						See all the details of this deployment | <Badge variant="blank" className="text-xs">{filteredLogs.length} lines</Badge>
					</DialogDescription>
				</DialogHeader>

				<div 
					ref={scrollRef}
					onScroll={handleScroll}
					className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-[#d4d4d4] dark:bg-[#050506] rounded custom-logs-scrollbar"
				>					{ 
						filteredLogs.length > 0 ? filteredLogs.map((log: LogLine, index: number) => (
							<TerminalLine
								key={index}
								log={log}
								noTimestamp
							/>
						)) : 
						(
							<div className="flex justify-center items-center h-full text-muted-foreground">
								<Loader2 className="h-6 w-6 animate-spin" />
							</div>
						)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
