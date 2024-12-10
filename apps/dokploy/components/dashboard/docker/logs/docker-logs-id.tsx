import { Input, NumberInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Terminal } from "@xterm/xterm";
import { Search } from "lucide-react";
import React, { useEffect, useRef, useCallback } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
	id: string;
	containerId: string;
	serverId?: string | null;
}

export const DockerLogsId: React.FC<Props> = ({
	id,
	containerId,
	serverId,
}) => {
	const [term, setTerm] = React.useState<Terminal>();
	const [lines, setLines] = React.useState<number>(40);
	const [search, setSearch] = React.useState<string>("");
	const [debouncedLines, setDebouncedLines] = React.useState(40);
	const [debouncedSearch, setDebouncedSearch] = React.useState("");
	const wsRef = useRef<WebSocket | null>(null);
	const terminalRef = useRef<Terminal>();

	useEffect(() => {
		const container = document.getElementById(id);
		if (container) {
			container.innerHTML = "";
		}

		const termi = new Terminal({
			cursorBlink: true,
			cols: 80,
			rows: 30,
			lineHeight: 1.25,
			fontWeight: 400,
			fontSize: 14,
			fontFamily:
				'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
			convertEol: true,
			theme: {
				cursor: "transparent",
				background: "rgba(0, 0, 0, 0)",
			},
		});

		const fitAddon = new FitAddon();
		termi.loadAddon(fitAddon);
		// @ts-ignore
		termi.open(container);

		requestAnimationFrame(() => {
			fitAddon.fit();
			termi.focus();
		});

		const handleResize = () => {
			requestAnimationFrame(() => {
				fitAddon.fit();
			});
		};
		window.addEventListener("resize", handleResize);

		terminalRef.current = termi;
		setTerm(termi);

		return () => {
			termi.dispose();
		};
	}, [id]);

	const setupWebSocket = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.close();
		}

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/docker-container-logs?containerId=${containerId}&tail=${debouncedLines}${serverId ? `&serverId=${serverId}` : ""}${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""}`;

		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onerror = (error) => {
			console.error("WebSocket error: ", error);
		};

		ws.onmessage = (e) => {
			terminalRef.current?.write(e.data);
		};

		ws.onclose = (e) => {
			console.log(e.reason);
			terminalRef.current?.write(`Connection closed!\nReason: ${e.reason}\n`);
			wsRef.current = null;
		};

		return () => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
		};
	}, [containerId, debouncedLines, debouncedSearch, serverId]);

	useEffect(() => {
		if (terminalRef.current) {
			terminalRef.current.clear();
			return setupWebSocket();
		}
	}, [setupWebSocket]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-4">
				<div className="w-40 flex flex-col gap-2">
					<Label>
						<span>Lines</span>
					</Label>
					<NumberInput
						placeholder="40"
						value={lines}
						onChange={(e) => setLines(Number(e.target.value) || 1)}
						debounceMs={500}
						onDebounce={(value) => setDebouncedLines(Number(value) || 1)}
					/>
				</div>
				<div className="flex-1 flex flex-col gap-2">
					<Label>
						<span>&nbsp;</span>
					</Label>
					<div className="relative">
						<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
						<Input
							type="search"
							placeholder="Filter lines..."
							autoComplete="on"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							debounceMs={500}
							onDebounce={(value) => setDebouncedSearch(value)}
							className="pl-8"
						/>
					</div>
				</div>
			</div>

			<div className="w-full h-full rounded-lg p-2 bg-[#19191A]">
				<div id={id} />
			</div>
		</div>
	);
};
