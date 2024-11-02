import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useRef, useState } from "react";

interface Props {
	logPath: string | null;
	open: boolean;
	onClose: () => void;
	serverId?: string;
}
export const ShowDeployment = ({ logPath, open, onClose, serverId }: Props) => {
	const [data, setData] = useState("");
	const endOfLogsRef = useRef<HTMLDivElement>(null);
	const wsRef = useRef<WebSocket | null>(null); // Ref to hold WebSocket instance

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

	const scrollToBottom = () => {
		endOfLogsRef.current?.scrollIntoView({ behavior: "smooth" });
	};

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
					<code>
						<pre className="whitespace-pre-wrap break-words">
							{data || "Loading..."}
						</pre>
						<div ref={endOfLogsRef} />
					</code>
				</div>
			</DialogContent>
		</Dialog>
	);
};
