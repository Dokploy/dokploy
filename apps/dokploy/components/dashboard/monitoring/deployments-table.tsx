import { AlertTriangle, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "@/utils/api";

interface Props {
	serverId: string | null;
}

const TYPE_VARIANT = {
	application: "blue",
	compose: "blue",
	postgres: "orange",
	mysql: "orange",
	mariadb: "orange",
	mongo: "orange",
	redis: "orange",
	libsql: "orange",
} as const;

const STATUS_COLOR: Record<string, string> = {
	running: "text-emerald-500",
	done: "text-emerald-500",
	idle: "text-muted-foreground",
	error: "text-red-500",
};

const STATUS_DOT: Record<string, string> = {
	running: "bg-emerald-500",
	done: "bg-emerald-500",
	idle: "bg-muted-foreground/50",
	error: "bg-red-500",
};

const formatBytesPerSec = (bps: number | null): string => {
	if (bps === null) return "—";
	if (bps < 1024) return `${bps.toFixed(0)} B/s`;
	const kb = bps / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB/s`;
	return `${(mb / 1024).toFixed(2)} GB/s`;
};

const formatMB = (mb: number | null): string => {
	if (mb === null) return "—";
	if (mb < 1024) return `${mb.toFixed(0)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
};

export const DeploymentsTable = ({ serverId }: Props) => {
	const {
		data: deployments,
		isLoading: deploymentsLoading,
		error: deploymentsError,
	} = api.server.getServerDeployments.useQuery(
		{ serverId },
		{ refetchInterval: 30_000 },
	);

	const { data: metrics, error: metricsError } =
		api.server.getDeploymentMetrics.useQuery(
			{ serverId },
			{ refetchInterval: 10_000, retry: false },
		);

	const metricsByApp = useMemo(() => {
		const map = new Map<string, NonNullable<typeof metrics>[number]>();
		for (const m of metrics ?? []) map.set(m.appName, m);
		return map;
	}, [metrics]);

	if (deploymentsLoading) {
		return (
			<div className="flex h-40 items-center justify-center rounded-lg border text-muted-foreground">
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				Loading deployments…
			</div>
		);
	}

	if (deploymentsError) {
		return (
			<AlertBlock type="error">
				Failed to load deployments: {deploymentsError.message}
			</AlertBlock>
		);
	}

	if (!deployments || deployments.length === 0) {
		return (
			<div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
				No deployments on this server yet
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
					Deployments on this server · {deployments.length}
				</div>
				{metricsError && (
					<div className="flex items-center gap-1 text-xs text-amber-500">
						<AlertTriangle className="h-3 w-3" />
						Live metrics unavailable
					</div>
				)}
			</div>
			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[32%]">Deployment</TableHead>
							<TableHead className="w-[10%]">Type</TableHead>
							<TableHead className="w-[12%]">Status</TableHead>
							<TableHead className="w-[14%]">CPU</TableHead>
							<TableHead className="w-[16%]">Memory</TableHead>
							<TableHead className="w-[16%]">Net ↓ / ↑</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{deployments.map((d) => {
							const m = metricsByApp.get(d.appName);
							const isRunning = d.status === "running" || d.status === "done";
							return (
								<TableRow key={`${d.type}-${d.id}`}>
									<TableCell>
										<div className="font-medium">{d.name}</div>
										<div className="text-xs text-muted-foreground">
											{d.appName}
										</div>
									</TableCell>
									<TableCell>
										<Badge
											variant={TYPE_VARIANT[d.type] ?? "blank"}
											className="capitalize"
										>
											{d.type}
										</Badge>
									</TableCell>
									<TableCell>
										<div
											className={cn(
												"flex items-center gap-1.5 text-xs",
												STATUS_COLOR[d.status],
											)}
										>
											<span
												className={cn(
													"h-1.5 w-1.5 rounded-full",
													STATUS_DOT[d.status],
												)}
											/>
											<span className="capitalize">{d.status}</span>
										</div>
									</TableCell>
									<TableCell>
										{isRunning && m?.ok && m.cpuPct !== null ? (
											<UsageCell
												value={`${m.cpuPct.toFixed(1)}%`}
												percent={Math.min(100, m.cpuPct)}
												color="bg-chart-1"
											/>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell>
										{isRunning && m?.ok && m.memUsedMB !== null ? (
											<UsageCell
												value={formatMB(m.memUsedMB)}
												percent={
													m.memPct !== null ? Math.min(100, m.memPct) : 0
												}
												color="bg-chart-4"
											/>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell className="text-xs">
										{isRunning && m?.ok ? (
											<>
												{formatBytesPerSec(m.netInBps)} /{" "}
												{formatBytesPerSec(m.netOutBps)}
											</>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</div>
	);
};

const UsageCell = ({
	value,
	percent,
	color,
}: {
	value: string;
	percent: number;
	color: string;
}) => (
	<div className="space-y-1">
		<div className="text-xs">{value}</div>
		<div className="h-1 w-full rounded-full bg-muted">
			<div
				className={cn("h-full rounded-full", color)}
				style={{ width: `${percent}%` }}
			/>
		</div>
	</div>
);
