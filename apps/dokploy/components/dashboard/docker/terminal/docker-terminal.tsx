import { Terminal } from "@xterm/xterm";
import React, { useEffect, useRef } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttachAddon } from "@xterm/addon-attach";
import { useTheme } from "next-themes";

interface Props {
	id: string;
	containerId: string;
	serverId?: string;
}

export const DockerTerminal: React.FC<Props> = ({
	id,
	containerId,
	serverId,
}) => {
	const termRef = useRef(null);
	const [activeWay, setActiveWay] = React.useState<string | undefined>("bash");
	const { resolvedTheme } = useTheme();
	useEffect(() => {
		const container = document.getElementById(id);
		if (container) {
			container.innerHTML = "";
		}
		const term = new Terminal({
			cursorBlink: true,
			lineHeight: 1.6, // Increased line height to prevent text overlap
			convertEol: true,
			scrollback: 5000, // Increased scrollback to prevent text loss
			// Removed fixed dimensions to allow dynamic resizing
			theme: {
				cursor: resolvedTheme === "light" ? "#000000" : "transparent",
				background: "rgba(0, 0, 0, 0)",
				foreground: "currentColor",
			},
		});
		const addonFit = new FitAddon();

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/docker-container-terminal?containerId=${containerId}&activeWay=${activeWay}${serverId ? `&serverId=${serverId}` : ""}`;

		const ws = new WebSocket(wsUrl);

		const addonAttach = new AttachAddon(ws);
		// @ts-ignore
		term.open(termRef.current);
		// @ts-ignore
		term.loadAddon(addonFit);
		term.loadAddon(addonAttach);
		addonFit.fit();

		// Send initial terminal dimensions
		const { cols, rows } = term;
		ws.send(JSON.stringify({ type: 'resize', cols, rows }));

		// Listen for terminal resize events
		term.onResize(({ cols, rows }) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'resize', cols, rows }));
			}
		});

		// Handle paste events to prevent unstable content
		term.onData((data) => {
			// Rate limit large paste operations
			if (data.length > 1000) {
				const chunks = data.match(/.{1,1000}/g) || [];
				let i = 0;
				const sendChunk = () => {
					if (i < chunks.length && chunks[i] !== undefined) {
						ws.send(chunks[i]!); // Type assertion since we checked for undefined
						i++;
						setTimeout(sendChunk, 10);
					}
				};
				sendChunk();
			} else {
				ws.send(data);
			}
		});

		// Handle window resize events
		const resizeObserver = new ResizeObserver(() => {
			addonFit.fit();
		});

		if (termRef.current) {
			resizeObserver.observe(termRef.current);
		}

		return () => {
			ws.readyState === WebSocket.OPEN && ws.close();
			resizeObserver.disconnect();
		};
	}, [containerId, activeWay, id]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<span>
					Select way to connect to <b>{containerId}</b>
				</span>
				<Tabs value={activeWay} onValueChange={setActiveWay}>
					<TabsList>
						<TabsTrigger value="bash">Bash</TabsTrigger>
						<TabsTrigger value="sh">/bin/sh</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>
			<div className="w-full h-full rounded-lg p-2 bg-transparent border">
				<div id={id} ref={termRef} />
			</div>
		</div>
	);
};
