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
}
export const ShowDeploymentCompose = ({ logPath, open, onClose }: Props) => {
	const [data, setData] = useState("");
	const endOfLogsRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open || !logPath) return;

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/listen-deployment?logPath=${logPath}`;
		const ws = new WebSocket(wsUrl);

		ws.onmessage = (e) => {
			setData((currentData) => currentData + e.data);
		};

		return () => ws.close();
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
				if (!e) setData("");
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
