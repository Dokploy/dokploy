import { Clock, Cpu, HardDrive, Loader2, MemoryStick } from "lucide-react";
import { useMemo } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import { api } from "@/utils/api";
import { CPUChart } from "./paid/servers/cpu-chart";
import { DiskChart } from "./paid/servers/disk-chart";
import { MemoryChart } from "./paid/servers/memory-chart";
import { NetworkChart } from "./paid/servers/network-chart";
import { TIME_RANGES, type TimeRange } from "./time-range-picker";

interface Props {
	serverId: string | null;
	range: TimeRange;
}

interface RawMetric {
	cpu: string;
	cpuModel: string;
	cpuCores: number;
	cpuPhysicalCores: number;
	cpuSpeed: number;
	os: string;
	distro: string;
	kernel: string;
	arch: string;
	memUsed: string;
	memUsedGB: string;
	memTotal: string;
	uptime: number;
	diskUsed: string;
	totalDisk: string;
	networkIn: string;
	networkOut: string;
	timestamp: string;
}

const formatUptime = (seconds: number): string => {
	const days = Math.floor(seconds / (24 * 60 * 60));
	const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
	const minutes = Math.floor((seconds % (60 * 60)) / 60);
	return `${days}d ${hours}h ${minutes}m`;
};

export const SystemMetricsSection = ({ serverId, range }: Props) => {
	const { dataPoints } = TIME_RANGES[range];
	const { data, isLoading, error } = api.server.getSystemMetrics.useQuery(
		{ serverId, dataPoints: String(dataPoints) },
		{ refetchInterval: 10_000, retry: false },
	);

	const historical = useMemo(() => {
		return (data ?? []).map((m: RawMetric) => ({
			timestamp: m.timestamp,
			cpu: Number.parseFloat(m.cpu),
			cpuModel: m.cpuModel,
			cpuCores: m.cpuCores,
			cpuPhysicalCores: m.cpuPhysicalCores,
			cpuSpeed: m.cpuSpeed,
			os: m.os,
			distro: m.distro,
			kernel: m.kernel,
			arch: m.arch,
			memUsed: Number.parseFloat(m.memUsed),
			memUsedGB: Number.parseFloat(m.memUsedGB),
			memTotal: Number.parseFloat(m.memTotal),
			networkIn: Number.parseFloat(m.networkIn),
			networkOut: Number.parseFloat(m.networkOut),
			diskUsed: Number.parseFloat(m.diskUsed),
			totalDisk: Number.parseFloat(m.totalDisk),
			uptime: m.uptime,
		}));
	}, [data]);

	const latest = historical[historical.length - 1];

	if (isLoading) {
		return (
			<div className="flex h-[300px] items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return (
			<AlertBlock type="error">
				Can't reach monitoring agent on this server.
				<div className="text-xs opacity-80">{error.message}</div>
			</AlertBlock>
		);
	}

	if (!latest) {
		return (
			<AlertBlock type="info">
				No monitoring data yet. Wait a minute and refresh.
			</AlertBlock>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					icon={Clock}
					label="Uptime"
					value={formatUptime(latest.uptime)}
				/>
				<StatCard icon={Cpu} label="CPU" value={`${latest.cpu.toFixed(1)}%`} />
				<StatCard
					icon={MemoryStick}
					label="Memory"
					value={`${latest.memUsedGB.toFixed(1)} / ${latest.memTotal.toFixed(1)} GB`}
				/>
				<StatCard
					icon={HardDrive}
					label="Disk"
					value={`${latest.diskUsed.toFixed(1)}%`}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
				<CPUChart data={historical} />
				<MemoryChart data={historical} />
				<DiskChart data={latest} />
				<NetworkChart data={historical} />
			</div>
		</div>
	);
};

const StatCard = ({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Clock;
	label: string;
	value: string;
}) => (
	<div className="rounded-lg border p-4 shadow-sm">
		<div className="flex items-center gap-2">
			<Icon className="h-4 w-4 text-muted-foreground" />
			<span className="text-sm font-medium">{label}</span>
		</div>
		<p className="mt-2 text-xl font-bold">{value}</p>
	</div>
);
