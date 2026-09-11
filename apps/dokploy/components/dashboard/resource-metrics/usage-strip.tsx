import {
	Activity,
	Cpu,
	HardDrive,
	type LucideIcon,
	MemoryStick,
	Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/utils/api";

type ResourceMetricsSummary =
	RouterOutputs["project"]["resourceMetrics"]["services"][string];

interface Props {
	metrics?: ResourceMetricsSummary;
	className?: string;
	compact?: boolean;
}

const formatBytes = (bytes?: number) => {
	if (!bytes || bytes <= 0) return "0B";

	const units = ["B", "KiB", "MiB", "GiB", "TiB"];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}

	return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)}${units[unitIndex]}`;
};

const formatPercent = (value?: number) => {
	if (!value || value <= 0) return "0%";
	return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`;
};

const MetricSparkline = ({
	values,
	className,
}: {
	values: number[];
	className?: string;
}) => {
	if (values.length < 2) {
		return <div className={cn("h-5 w-16 rounded bg-muted/40", className)} />;
	}

	const width = 64;
	const height = 20;
	const max = Math.max(...values, 1);
	const min = Math.min(...values, 0);
	const range = Math.max(max - min, 1);
	const points = values
		.map((value, index) => {
			const x = (index / (values.length - 1)) * width;
			const y = height - ((value - min) / range) * height;
			return `${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(" ");

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className={cn("h-5 w-16 overflow-visible", className)}
			aria-hidden="true"
		>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
};

const MetricPill = ({
	icon: Icon,
	label,
	value,
	title,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	title: string;
}) => (
	<span
		className="inline-flex items-center gap-1 rounded-md border bg-background/70 px-1.5 py-1"
		title={title}
	>
		<Icon className="size-3 text-muted-foreground" />
		<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
			{label}
		</span>
		<span className="font-mono text-[11px] text-foreground">{value}</span>
	</span>
);

export const ResourceUsageStrip = ({
	metrics,
	className,
	compact = false,
}: Props) => {
	const current = metrics?.current;
	const cpuHistory =
		metrics?.history
			.slice(-24)
			.map((point: { cpuPercent: number }) => point.cpuPercent) ?? [];

	if (!current) {
		if (metrics?.unavailable) {
			return (
				<div
					className={cn(
						"flex items-center gap-2 text-[11px] text-muted-foreground",
						className,
					)}
					title="Unable to collect Docker metrics for this service or project"
				>
					<Activity className="size-3" />
					<span>Metrics unavailable</span>
				</div>
			);
		}

		return null;
	}

	if (current.containers === 0) {
		return (
			<div
				className={cn(
					"flex items-center gap-2 text-[11px] text-muted-foreground",
					className,
				)}
			>
				<Activity className="size-3" />
				<span>No running containers</span>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-1.5 text-xs",
				compact && "gap-1",
				className,
			)}
		>
			<div className="flex items-center gap-1 rounded-md border bg-background/70 px-1.5 py-1 text-primary">
				<MetricSparkline values={cpuHistory} />
			</div>
			{metrics?.unavailable && (
				<span
					className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-[11px] text-amber-700 dark:text-amber-300"
					title="Showing the last collected sample because Docker metrics are currently unavailable"
				>
					<Activity className="size-3" />
					Stale
				</span>
			)}
			<MetricPill
				icon={Cpu}
				label="CPU"
				value={formatPercent(current.cpuPercent)}
				title="CPU usage across running containers"
			/>
			<MetricPill
				icon={MemoryStick}
				label="Mem"
				value={formatBytes(current.memoryBytes)}
				title={`Memory usage${current.memoryLimitBytes ? ` / ${formatBytes(current.memoryLimitBytes)} limit` : ""}`}
			/>
			<MetricPill
				icon={HardDrive}
				label="Disk"
				value={`${formatBytes(current.blockReadBytes)} / ${formatBytes(current.blockWriteBytes)}`}
				title="Disk I/O read / write from Docker stats"
			/>
			<MetricPill
				icon={Network}
				label="Net"
				value={`${formatBytes(current.networkRxBytes)} / ${formatBytes(current.networkTxBytes)}`}
				title="Network input / output from Docker stats"
			/>
		</div>
	);
};
