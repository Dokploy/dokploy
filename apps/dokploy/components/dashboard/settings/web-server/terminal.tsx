import { Terminal as XTerm } from "@xterm/xterm";
import type React from "react";
import { useEffect, useRef } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AttachAddon } from "@xterm/addon-attach";
import { useTheme } from "next-themes";
import { getLocalServerData } from "./local-server-config";

interface Props {
	id: string;
	serverId: string;
}

export const Terminal: React.FC<Props> = ({ id, serverId }) => {
	const termRef = useRef<HTMLDivElement>(null);
	const initialized = useRef<boolean>(false);
	const { resolvedTheme } = useTheme();
	useEffect(() => {
		if (initialized.current) {
			// Required in strict mode to avoid issues due to double wss connection
			return;
		}

		initialized.current = true;
		const container = document.getElementById(id);
		if (container) {
			container.innerHTML = "";
		}
		const term = new XTerm({
			cursorBlink: true,
			lineHeight: 1.6, // Increased line height to prevent text overlap
			convertEol: true,
			rows: 24,
			cols: 80,
			scrollback: 5000, // Increased scrollback to prevent text loss
			theme: {
				cursor: resolvedTheme === "light" ? "#000000" : "transparent",
				background: "rgba(0, 0, 0, 0)",
				foreground: "currentColor",
			},
		});
		const addonFit = new FitAddon();

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const urlParams = new URLSearchParams();
		urlParams.set("serverId", serverId);

		if (serverId === "local") {
			const { port, username } = getLocalServerData();
			urlParams.set("port", port.toString());
			urlParams.set("username", username);
		}

		const wsUrl = `${protocol}//${window.location.host}/terminal?${urlParams}`;

		const ws = new WebSocket(wsUrl);
		const addonAttach = new AttachAddon(ws);

		// @ts-ignore
		term.open(termRef.current);
		// @ts-ignore
		term.loadAddon(addonFit);
		term.loadAddon(addonAttach);
		addonFit.fit();

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
	}, [id, serverId]);

	return (
		<div className="flex flex-col gap-4">
			<div className="w-full h-full bg-transparent border rounded-lg p-2 ">
				<div id={id} ref={termRef} className="rounded-xl" />
			</div>
		</div>
	);
};
