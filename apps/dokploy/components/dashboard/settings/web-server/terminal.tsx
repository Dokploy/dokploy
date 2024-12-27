import { Terminal as XTerm } from "@xterm/xterm";
import type React from "react";
import { useEffect, useRef } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AttachAddon } from "@xterm/addon-attach";
import { useTheme } from "next-themes";

interface Props {
	id: string;
	serverId: string;
}

export const Terminal: React.FC<Props> = ({ id, serverId }) => {
	const termRef = useRef(null);
	const { resolvedTheme } = useTheme();
	useEffect(() => {
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

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/terminal?serverId=${serverId}`;

		const ws = new WebSocket(wsUrl);
		const addonAttach = new AttachAddon(ws);

		// @ts-ignore
		term.open(termRef.current);
		// @ts-ignore
		term.loadAddon(addonFit);
		term.loadAddon(addonAttach);
		addonFit.fit();
		return () => {
			ws.readyState === WebSocket.OPEN && ws.close();
		};
	}, [id, serverId]);

	return (
		<div className="flex flex-col gap-4">
			<div className="h-full w-full rounded-lg border bg-transparent p-2 ">
				<div id={id} ref={termRef} className="rounded-xl" />
			</div>
		</div>
	);
};
