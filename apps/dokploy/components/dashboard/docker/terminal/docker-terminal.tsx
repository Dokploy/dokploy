import { Terminal } from "@xterm/xterm";
import React, { useEffect, useRef } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttachAddon } from "@xterm/addon-attach";
import { WebLinksAddon } from "@xterm/addon-web-links";

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
	useEffect(() => {
		const container = document.getElementById(id);
		if (container) {
			container.innerHTML = "";
		}
		const term = new Terminal({
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

		const wsUrl = `${protocol}//${window.location.host}/docker-container-terminal?containerId=${containerId}&activeWay=${activeWay}${serverId ? `&serverId=${serverId}` : ""}`;

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
	}, [containerId, activeWay, id]);

	return (
		<div className="flex flex-col gap-4 w-full">
			<div className="flex flex-col gap-2 w-full">
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
			<div className="w-full h-full rounded-lg p-2 border  min-h-[50vh]">
				<div id={id} ref={termRef} />
			</div>
		</div>
	);
};
