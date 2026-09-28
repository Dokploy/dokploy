import { Terminal as XTerm } from "@xterm/xterm";
import type React from "react";
import { useEffect, useRef } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AttachAddon } from "@xterm/addon-attach";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { useTheme } from "next-themes";
import { fixMacOsAltKeys } from "@/lib/terminal-keyboard";
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

		// @ts-ignore
		term.open(termRef.current);
		// @ts-ignore
		term.loadAddon(addonFit);
		addonFit.fit();

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const urlParams = new URLSearchParams();
		urlParams.set("serverId", serverId);
		urlParams.set("cols", term.cols.toString());
		urlParams.set("rows", term.rows.toString());

		if (serverId === "local") {
			const { port, username } = getLocalServerData();
			urlParams.set("port", port.toString());
			urlParams.set("username", username);
		}

		const wsUrl = `${protocol}//${window.location.host}/terminal?${urlParams}`;

		const ws = new WebSocket(wsUrl);
		const addonAttach = new AttachAddon(ws);
		term.loadAddon(addonAttach);

		const sendResize = (cols: number, rows: number) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "resize", cols, rows }));
			}
		};
		term.onResize(({ cols, rows }) => sendResize(cols, rows));

		const resizeObserver = new ResizeObserver(() => addonFit.fit());
		if (termRef.current) {
			resizeObserver.observe(termRef.current);
		}

		return () => {
			resizeObserver.disconnect();
			ws.readyState === WebSocket.OPEN && ws.close();
		};
	}, [id, serverId]);

	return (
		<div className="flex flex-col gap-4">
			<div className="w-full h-full bg-transparent border rounded-lg p-2">
				<div id={id} ref={termRef} className="rounded-xl" />
			</div>
		</div>
	);
};
