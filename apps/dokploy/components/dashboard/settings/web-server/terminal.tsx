import { Terminal as XTerm } from "@xterm/xterm";
import type React from "react";
import { useEffect, useRef } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AttachAddon } from "@xterm/addon-attach";

interface Props {
	id: string;
	userSSH?: string;
}

export const Terminal: React.FC<Props> = ({ id, userSSH = "root" }) => {
	const termRef = useRef(null);

	useEffect(() => {
		const container = document.getElementById(id);
		if (container) {
			container.innerHTML = "";
		}
		const term = new XTerm({
			cursorBlink: true,
			cols: 80,
			rows: 30,
			lineHeight: 1.4,
			convertEol: true,
			theme: {
				cursor: "transparent",
				background: "#19191A",
			},
		});
		const addonFit = new FitAddon();

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/terminal?userSSH=${userSSH}`;

		const ws = new WebSocket(wsUrl);
		const addonAttach = new AttachAddon(ws);

		// @ts-ignore
		term.open(termRef.current);
		term.loadAddon(addonFit);
		term.loadAddon(addonAttach);
		addonFit.fit();
		return () => {
			ws.readyState === WebSocket.OPEN && ws.close();
		};
	}, [id, userSSH]);

	return (
		<div className="flex flex-col gap-4">
			<div className="w-full h-full bg-input rounded-lg p-2 ">
				<div id={id} ref={termRef} className="rounded-xl" />
			</div>
		</div>
	);
};
