import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AttachAddon } from "@xterm/addon-attach";
import { Button } from "@/components/ui/button";

interface Props {
	id: string;
	containerId: string;
}

export const DockerTerminal: React.FC<Props> = ({ id, containerId }) => {
	const termRef = useRef(null);
	const [activeWay, setActiveWay] = React.useState<string | null>("bash");
	useEffect(() => {
		const container = document.getElementById(id);
		if (container) {
			container.innerHTML = "";
		}
		const term = new Terminal({
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

		const wsUrl = `${protocol}//${window.location.host}/docker-container-terminal?containerId=${containerId}&activeWay=${activeWay}`;

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
	}, [containerId, activeWay, id]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<span>
					Select way to connect to <b>{containerId}</b>
				</span>
				<div className="flex flex-row gap-4 w-fit">
					<Button onClick={() => setActiveWay("sh")}>SH</Button>
					<Button onClick={() => setActiveWay("bash")}>Bash</Button>
					<Button onClick={() => setActiveWay("sh")}>/bin/sh</Button>
				</div>
			</div>
			<div className="w-full h-full bg-input rounded-lg p-2 ">
				<div id={id} ref={termRef} className="rounded-xl" />
			</div>
		</div>
	);
};
