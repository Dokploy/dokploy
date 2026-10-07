import { Terminal } from "@xterm/xterm";
import React, { useEffect, useRef } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AttachAddon } from "@xterm/addon-attach";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { useTheme } from "next-themes";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fixMacOsAltKeys } from "@/lib/terminal-keyboard";

interface Props {
	id: string;
	containerId?: string;
	serverId?: string;
	serviceId?: string;
}

// Sentinel the container-picker modal renders with before a real container
// is selected/auto-selected — never worth opening a connection for.
const PLACEHOLDER_CONTAINER_ID = "select-a-container";

export const DockerTerminal: React.FC<Props> = ({
	id,
	containerId,
	serverId,
	serviceId,
}) => {
	const termRef = useRef(null);
	const [activeWay, setActiveWay] = React.useState<string | undefined>("bash");
	const { resolvedTheme } = useTheme();
	useEffect(() => {
		if (!containerId || containerId === PLACEHOLDER_CONTAINER_ID) {
			return;
		}

		let cancelled = false;
		let term: Terminal | null = null;
		let ws: WebSocket | null = null;
		let resizeObserver: ResizeObserver | null = null;

		// Deferred a frame so React StrictMode's dev-only phantom mount+cleanup
		// (which runs synchronously, before anything paints) never creates a
		// terminal in the first place — dodges a known xterm.js dispose race
		// (xtermjs/xterm.js#5011) where a deferred internal callback outlives
		// term.dispose() and reads renderer state that's already gone.
		const frame = requestAnimationFrame(() => {
			if (cancelled) return;

			const container = document.getElementById(id);
			if (container) {
				container.innerHTML = "";
			}
			term = new Terminal({
				cursorBlink: true,
				lineHeight: 1.4,
				convertEol: true,
				theme: {
					cursor: resolvedTheme === "light" ? "#000000" : "transparent",
					background: "rgba(0, 0, 0, 0)",
					foreground: "currentColor",
				},
			});
			const addonFit = new FitAddon();
			const clipboardAddon = new ClipboardAddon();
			term.loadAddon(clipboardAddon);
			fixMacOsAltKeys(term);
			// @ts-expect-error
			term.open(termRef.current);
			term.loadAddon(addonFit);
			addonFit.fit();

			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const wsUrl = `${protocol}//${window.location.host}/docker-container-terminal?containerId=${containerId}&activeWay=${activeWay}&cols=${term.cols}&rows=${term.rows}${serverId ? `&serverId=${serverId}` : ""}${serviceId ? `&serviceId=${serviceId}` : ""}`;

			ws = new WebSocket(wsUrl);
			const addonAttach = new AttachAddon(ws);
			term.loadAddon(addonAttach);

			const sendResize = (cols: number, rows: number) => {
				if (ws && ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: "resize", cols, rows }));
				}
			};
			term.onResize(({ cols, rows }) => sendResize(cols, rows));

			resizeObserver = new ResizeObserver(() => addonFit.fit());
			if (termRef.current) {
				resizeObserver.observe(termRef.current);
			}
		});

		return () => {
			cancelled = true;
			cancelAnimationFrame(frame);
			resizeObserver?.disconnect();
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
			term?.dispose();
		};
	}, [containerId, activeWay, id]);

	const hasContainer =
		!!containerId && containerId !== PLACEHOLDER_CONTAINER_ID;

	return (
		<div className="flex flex-col gap-4">
			{hasContainer && (
				<div className="flex flex-col gap-2  mt-4">
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
			)}
			{hasContainer ? (
				<div className="w-full h-[420px] rounded-lg p-2 bg-transparent border">
					<div id={id} ref={termRef} className="h-full" />
				</div>
			) : (
				<div className="flex h-[420px] w-full items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
					Select a container above to open a terminal. If none are listed, make
					sure the service is deployed and running.
				</div>
			)}
		</div>
	);
};
