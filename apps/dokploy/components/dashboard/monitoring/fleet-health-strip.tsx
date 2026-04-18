import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

type ServerStatus = "ok" | "warn" | "down" | "unconfigured";

export interface FleetServer {
	serverId: string | null;
	name: string;
	configured: boolean;
	thresholds?: { cpu: number; memory: number };
}

interface Props {
	servers: FleetServer[];
	activeServerId: string | null;
	onSelect: (serverId: string | null) => void;
}

const dotClass: Record<ServerStatus, string> = {
	ok: "bg-emerald-500",
	warn: "bg-amber-500",
	down: "bg-red-500",
	unconfigured: "bg-muted-foreground/40",
};

const statusLabel: Record<ServerStatus, string> = {
	ok: "Healthy",
	warn: "High usage",
	down: "Unreachable",
	unconfigured: "Monitoring not set up",
};

const FLEET_REFRESH_MS = 30_000;

export const FleetHealthStrip = ({
	servers,
	activeServerId,
	onSelect,
}: Props) => {
	const queries = api.useQueries((t) =>
		servers.map((s) =>
			t.server.getSystemMetrics(
				{ serverId: s.serverId, dataPoints: "1" },
				{
					refetchInterval: FLEET_REFRESH_MS,
					enabled: s.configured,
					retry: false,
				},
			),
		),
	);

	return (
		<div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
			<span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
				Fleet
			</span>
			<div className="flex flex-wrap items-center gap-3">
				{servers.map((server, i) => {
					const q = queries[i];
					const status = deriveStatus(server, q);
					const isActive = server.serverId === activeServerId;
					return (
						<button
							key={server.serverId ?? "__local__"}
							type="button"
							onClick={() => onSelect(server.serverId)}
							title={statusLabel[status]}
							className={cn(
								"flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs transition-colors",
								isActive
									? "bg-background font-medium text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<span
								className={cn("h-2 w-2 rounded-full", dotClass[status])}
								aria-hidden
							/>
							<span>{server.name}</span>
						</button>
					);
				})}
			</div>
			<span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground/70">
				refresh 30s
			</span>
		</div>
	);
};

type QueryState = {
	data?: unknown;
	isError?: boolean;
	isLoading?: boolean;
	isFetching?: boolean;
};

const deriveStatus = (
	server: FleetServer,
	q: QueryState | undefined,
): ServerStatus => {
	if (!server.configured) return "unconfigured";
	if (!q) return "unconfigured";
	if (q.isError) return "down";
	if (!q.data) return q.isLoading || q.isFetching ? "ok" : "unconfigured";

	const data = q.data as Array<{
		cpu?: string;
		memUsed?: string;
	}>;
	const latest = data[data.length - 1];
	if (!latest) return "down";

	const cpu = Number.parseFloat(latest.cpu ?? "0");
	const mem = Number.parseFloat(latest.memUsed ?? "0");
	const cpuThreshold = server.thresholds?.cpu ?? 0;
	const memThreshold = server.thresholds?.memory ?? 0;

	const overCpu = cpuThreshold > 0 && cpu >= cpuThreshold;
	const overMem = memThreshold > 0 && mem >= memThreshold;
	if (overCpu || overMem) return "warn";
	if (cpu >= 90 || mem >= 90) return "warn";
	return "ok";
};
