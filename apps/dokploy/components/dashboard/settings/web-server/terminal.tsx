import { Terminal as XTerm } from "@xterm/xterm";
import type React from "react";
import { useEffect, useRef } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AttachAddon } from "@xterm/addon-attach";
import { WebLinksAddon } from "@xterm/addon-web-links";

interface Props {
	id: string;
	serverId: string;
}

export const Terminal: React.FC<Props> = ({ id, serverId }) => {
	const termRef = useRef(null);

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
				cursor: "transparent",
				background: "transparent",
			},
		});
		const addonFit = new FitAddon();

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/terminal?serverId=${serverId}`;

		const ws = new WebSocket(wsUrl);
		const addonAttach = new AttachAddon(ws);

		// @ts-ignore
		term.open(termRef.current);
		term.loadAddon(addonFit);
		term.loadAddon(addonAttach);
		term.loadAddon(new WebLinksAddon());
		addonFit.fit();

		return () => {
			ws.readyState === WebSocket.OPEN && ws.close();
		};
	}, [id, serverId]);

	return (
		<div className="flex flex-col gap-4 w-full">
			<div className="w-full h-full border rounded-lg p-2  min-h-[50vh]">
				<div id={id} ref={termRef} className="rounded-xl" />
			</div>
		</div>
	);
};
