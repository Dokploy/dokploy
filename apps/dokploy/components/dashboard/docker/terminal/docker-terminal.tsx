import { Terminal } from "@xterm/xterm";
import React, { useEffect, useRef, useState } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AttachAddon } from "@xterm/addon-attach";
import { useTheme } from "next-themes";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
	id: string;
	containerId?: string;
	serverId?: string;
}

export const DockerTerminal: React.FC<Props> = ({
	id,
	containerId,
	serverId,
}) => {
	const termRef = useRef(null);
	const [activeWay, setActiveWay] = React.useState<string | undefined>("bash");
	const [isConnected, setIsConnected] = useState(false);
	const { resolvedTheme } = useTheme();
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
				cursor: resolvedTheme === "light" ? "#000000" : "transparent",
				background: "rgba(0, 0, 0, 0)",
				foreground: "currentColor",
			},
		});
		const addonFit = new FitAddon();
		// @ts-ignore
		term.open(termRef.current);
		// @ts-ignore
		term.loadAddon(addonFit);
		addonFit.fit();

		// only connect if containerId is provided
		if (
			containerId &&
			containerId !== "" &&
			containerId !== "select-a-container"
		) {
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

			const wsUrl = `${protocol}//${window.location.host}/docker-container-terminal?containerId=${containerId}&activeWay=${activeWay}${serverId ? `&serverId=${serverId}` : ""}`;

			const ws = new WebSocket(wsUrl);

			const addonAttach = new AttachAddon(ws);

			term.loadAddon(addonAttach);

			ws.onopen = () => {
				setIsConnected(true);
			};

			ws.onclose = () => {
				setIsConnected(false);
			};

			return () => {
				ws.readyState === WebSocket.OPEN && ws.close();
			};
		}
	}, [containerId, activeWay, id]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2  mt-4">
				<Label>
					Select shell to connect to <b>{isConnected ? containerId : "..."}</b>
				</Label>
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
