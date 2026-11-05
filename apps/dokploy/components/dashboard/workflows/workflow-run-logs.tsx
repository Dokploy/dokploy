import copy from "copy-to-clipboard";
import { Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseLogs } from "../docker/logs/utils";
import { VirtualLogList } from "../docker/logs/virtual-log-list";

interface Props {
	logPath: string;
	serverId: string;
	errorMessage?: string | null;
}

export const WorkflowRunLogs = ({ logPath, serverId, errorMessage }: Props) => {
	const [data, setData] = useState("");
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		setData("");
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const params = new URLSearchParams({ logPath, serverId });
		const ws = new WebSocket(
			`${protocol}//${window.location.host}/listen-deployment?${params}`,
		);
		ws.onmessage = (e) => setData((current) => current + e.data);
		return () => ws.close();
	}, [logPath, serverId]);

	const logs = useMemo(
		() => parseLogs(errorMessage ? `${data}\n${errorMessage}` : data),
		[data, errorMessage],
	);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Badge variant="blank" className="text-xs tabular-nums">
					{logs.length} lines
				</Badge>
				<Button
					variant="outline"
					size="sm"
					className="h-7"
					disabled={logs.length === 0}
					onClick={() => {
						if (copy(logs.map((line) => line.message).join("\n"))) {
							setCopied(true);
							setTimeout(() => setCopied(false), 2000);
						}
					}}
				>
					{copied ? (
						<Check className="size-3.5" />
					) : (
						<Copy className="size-3.5" />
					)}
				</Button>
			</div>
			<VirtualLogList
				logs={logs}
				noTimestamp
				className="h-[640px] bg-background"
			>
				<div className="flex justify-center items-center h-full text-muted-foreground">
					<Loader2 className="size-6 animate-spin" />
				</div>
			</VirtualLogList>
		</div>
	);
};
