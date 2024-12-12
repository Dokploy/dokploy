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

interface Props {
	logPath: string | null;
	serverId?: string;
	open: boolean;
	onClose: () => void;
}
export const ShowDeploymentCompose = ({
	logPath,
	open,
	onClose,
	serverId,
}: Props) => {
	const [data, setData] = useState("");
	const endOfLogsRef = useRef<HTMLDivElement>(null);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const wsRef = useRef<WebSocket | null>(null); // Ref to hold WebSocket instance
	useEffect(() => {
		if (!open || !logPath) return;

		setData("");
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/listen-deployment?logPath=${logPath}&serverId=${serverId}`;
		const ws = new WebSocket(wsUrl);

		wsRef.current = ws; // Store WebSocket instance in ref

		ws.onmessage = (e) => {
			setData((currentData) => currentData + e.data);
		};

		ws.onerror = (error) => {
			console.error("WebSocket error: ", error);
		};

		ws.onclose = () => {
			wsRef.current = null;
		};

		return () => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				ws.close();
				wsRef.current = null;
			}
		};
	}, [logPath, open]);

	const scrollToBottom = () => {
		endOfLogsRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		const logs = parseLogs(data);
		console.log(data);
		console.log(logs);
		setFilteredLogs(logs);
	}, [data]);

	useEffect(() => {
		scrollToBottom();
	}, [data]);

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
						See all the details of this deployment
					</DialogDescription>
				</DialogHeader>

				<div className="text-wrap rounded-lg border p-4 text-sm sm:max-w-[59rem]">
					<div>
						
					{filteredLogs.map((log: LogLine, index: number) => (
								<TerminalLine
									key={index}
									log={log}
								/>
							)) || "Loading..."}
						<div ref={endOfLogsRef} />
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
