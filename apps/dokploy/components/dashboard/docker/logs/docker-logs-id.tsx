import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "xterm-addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import debounce from "lodash.debounce";
import { useCallback, useEffect, useRef, useState } from "react";

type TimeFilter =
	| "50lines"
	| "150lines"
	| "500lines"
	| "1000lines"
	| "last10min"
	| "last30min"
	| "lasthour"
	| "last24h";

interface Props {
	id: string;
	containerId: string;
	serverId?: string | null;
}

const TERMINAL_CONFIG = {
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
} as const;

export const DockerLogsId = ({ id, containerId, serverId }: Props) => {
	const [term, setTerm] = useState<Terminal>();
	const [lines, setLines] = useState(50);
	const [searchTerm, setSearchTerm] = useState("");
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("50lines");
	const wsRef = useRef<WebSocket | null>(null);

	const handleSearch = useCallback(
		debounce((term: string) => setSearchTerm(term), 600),
		[],
	);

	const formatLogLine = (logLine: string) => {
		const timestampMatch = logLine.match(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
		);
		if (!timestampMatch) return logLine;

		const timeStr = new Date(timestampMatch[0]).toLocaleTimeString();
		return `\x1b[90m${timeStr}\x1b[0m ${logLine}`;
	};

	useEffect(() => {
		const container = document.getElementById(id);
		if (!container) return;

		container.innerHTML = "";
		wsRef.current?.close();

		const terminal = new Terminal(TERMINAL_CONFIG);
		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(container);
		fitAddon.fit();
		terminal.focus();
		setTerm(terminal);

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/docker-container-logs?containerId=${containerId}&tail=${lines}${serverId ? `&serverId=${serverId}` : ""}&timeFilter=${timeFilter}`;

		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onmessage = ({ data }) => {
			const formattedLog = formatLogLine(data);
			if (searchTerm.length <= 1 || data.includes(searchTerm)) {
				terminal.write(`${formattedLog}\r\n`);
			}
		};

		ws.onclose = (e) => {
			terminal.write(`Connection closed!\nReason: ${e.reason}\n`);
			wsRef.current = null;
		};

		return () => ws.close();
	}, [lines, containerId, timeFilter, searchTerm, id, serverId]);

	useEffect(() => {
		term?.clear();
	}, [lines, term]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2 bg-background/95 rounded-md">
				<div className="flex flex-col gap-1">
					<Label htmlFor="time-filter">Lines & Time Range</Label>
					<Select
						value={timeFilter}
						onValueChange={(value: TimeFilter) => {
							setTimeFilter(value);
							if (value.endsWith("lines")) {
								setLines(Number.parseInt(value));
							}
						}}
					>
						<SelectTrigger id="time-filter" className="w-[160px]">
							<SelectValue placeholder="Select filter" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="50lines">50 lines</SelectItem>
							<SelectItem value="150lines">150 lines</SelectItem>
							<SelectItem value="500lines">500 lines</SelectItem>
							<SelectItem value="1000lines">1000 lines</SelectItem>
							<SelectSeparator className="my-2" />
							<SelectItem value="last10min">Last 10 min</SelectItem>
							<SelectItem value="last30min">Last 30 min</SelectItem>
							<SelectItem value="lasthour">Last hour</SelectItem>
							<SelectItem value="last24h">Last 24h</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="h-8 w-[1px] bg-border mx-2" />

				<div className="flex flex-col gap-1 flex-1">
					<Label htmlFor="search">Search Logs</Label>
					<div className="flex items-center gap-2">
						<Input
							id="search"
							type="text"
							placeholder="Search logs..."
							className="flex-1"
							onChange={(e) => handleSearch(e.target.value)}
						/>
					</div>
				</div>
			</div>

			<div className="w-full h-full rounded-lg p-2 bg-[#19191A]">
				<div id={id} />
			</div>
		</div>
	);
};
