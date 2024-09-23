import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Terminal } from "@xterm/xterm";
import React, { useEffect } from "react";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
	id: string;
	containerId: string;
	serverId?: string | null;
}

export const DockerLogsId: React.FC<Props> = ({
	id,
	containerId,
	serverId,
}) => {
	const [term, setTerm] = React.useState<Terminal>();
	const [lines, setLines] = React.useState<number>(40);

	const createTerminal = (): Terminal => {
		const container = document.getElementById(id);
		if (container) {
			container.innerHTML = "";
		}
		const termi = new Terminal({
			cursorBlink: true,
			cols: 80,
			rows: 30,
			lineHeight: 1.25,
			fontWeight: 400,
			fontSize: 14,
			fontFamily:
				'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',

			convertEol: true,
			theme: {
				cursor: "transparent",
				background: "rgba(0, 0, 0, 0)",
			},
		});

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/docker-container-logs?containerId=${containerId}&tail=${lines}${serverId ? `&serverId=${serverId}` : ""}`;
		const ws = new WebSocket(wsUrl);

		const fitAddon = new FitAddon();
		termi.loadAddon(fitAddon);
		// @ts-ignore
		termi.open(container);
		fitAddon.fit();
		termi.focus();
		setTerm(termi);

		ws.onmessage = (e) => {
			termi.write(e.data);
		};

		ws.onclose = (e) => {
			console.log(e.reason);

			termi.write(`Connection closed!\nReason: ${e.reason}\n`);
		};
		return termi;
	};

	useEffect(() => {
		createTerminal();
	}, [lines, containerId]);

	useEffect(() => {
		term?.clear();
	}, [lines, term]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Label>
					<span>Number of lines to show</span>
				</Label>
				<Input
					type="text"
					placeholder="Number of lines to show (Defaults to 35)"
					value={lines}
					onChange={(e) => {
						setLines(Number(e.target.value) || 1);
					}}
				/>
			</div>

			<div className="w-full h-full rounded-lg p-2 bg-[#19191A]">
				<div id={id} />
			</div>
		</div>
	);
};
