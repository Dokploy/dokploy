import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import type { GetServerSidePropsContext } from "next";
import type React from "react";
import { useEffect, useState } from "react";
import { CPUChart } from "@/components/metrics/cpu-chart";
import { MemoryChart } from "@/components/metrics/memory-chart";
import { NetworkChart } from "@/components/metrics/network-chart";
import { DiskChart } from "@/components/metrics/disk-chart";
import { Loader2, Clock, Cpu, MemoryStick, HardDrive } from "lucide-react";

const REFRESH_INTERVAL = 3000;
const METRICS_URL =
	process.env.NEXT_PUBLIC_METRICS_URL || "http://localhost:3001/metrics";
const MAX_DATA_POINTS = 30;

const Dashboard = () => {
	const [historicalData, setHistoricalData] = useState<any[]>([]);
	const [metrics, setMetrics] = useState<any>({});
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchMetrics = async () => {
		try {
			const response = await fetch(METRICS_URL);

			if (!response.ok) {
				throw new Error(`Failed to fetch metrics: ${response.statusText}`);
			}

			const data = await response.json();
			if (!Array.isArray(data) || data.length === 0) {
				throw new Error("No hay datos disponibles");
			}

			const formattedData = data.map((metric) => ({
				timestamp: metric.timestamp,
				cpu: Number.parseFloat(metric.cpu),
				memUsed: Number.parseFloat(metric.memUsed),
				memUsedGB: Number.parseFloat(metric.memUsedGB),
				memTotal: Number.parseFloat(metric.memTotal),
				networkIn: Number.parseFloat(metric.networkIn),
				networkOut: Number.parseFloat(metric.networkOut),
				diskUsed: Number.parseFloat(metric.diskUsed),
				totalDisk: Number.parseFloat(metric.totalDisk),
				uptime: Number.parseFloat(metric.uptime),
			}));

			setHistoricalData(formattedData);
			setMetrics(formattedData[formattedData.length - 1] || {});
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch metrics");
		} finally {
			setIsLoading(false);
		}
	};

	const formatUptime = (seconds: number): string => {
		const days = Math.floor(seconds / (24 * 60 * 60));
		const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
		const minutes = Math.floor((seconds % (60 * 60)) / 60);

		return `${days}d ${hours}h ${minutes}m`;
	};

	useEffect(() => {
		fetchMetrics();

		const interval = setInterval(() => {
			fetchMetrics();
		}, REFRESH_INTERVAL);

		return () => clearInterval(interval);
	}, []);

	if (isLoading) {
		return (
			<div className="flex h-[400px] w-full items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="mt-5 border p-4 rounded-lg min-h-[55vh] flex items-center justify-center">
				<span className="text-base font-medium leading-none text-muted-foreground">
					Error fetching metrics:{" "}
					<strong className="font-semibold text-destructive">{error}</strong>
				</span>
			</div>
		);
	}

	return (
		<div className="space-y-4 pt-5 pb-10">
			{/* Stats Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<div className="rounded-lg border text-card-foreground shadow-sm p-6">
					<div className="flex items-center gap-2">
						<Clock className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Uptime</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">
						{formatUptime(metrics.uptime || 0)}
					</p>
				</div>

				<div className="rounded-lg border text-card-foreground shadow-sm p-6">
					<div className="flex items-center gap-2">
						<Cpu className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">CPU Usage</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">{metrics.cpu?.toFixed(1)}%</p>
				</div>

				<div className="rounded-lg border text-card-foreground bg-transparent shadow-sm p-6">
					<div className="flex items-center gap-2">
						<MemoryStick className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Memory Usage</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">
						{metrics.memUsedGB?.toFixed(1)} GB / {metrics.memTotal} GB
					</p>
				</div>

				<div className="rounded-lg border text-card-foreground shadow-sm p-6">
					<div className="flex items-center gap-2">
						<HardDrive className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Disk Usage</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">
						{metrics.diskUsed?.toFixed(1)}%
					</p>
				</div>
			</div>

			{/* Charts Grid */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
				<CPUChart data={historicalData} />
				<MemoryChart data={historicalData} />
				<DiskChart data={metrics} />
				<NetworkChart data={historicalData} />
			</div>
		</div>
	);
};

Dashboard.getLayout = (page: React.ReactElement) => {
	return <DashboardLayout tab={"monitoring"}>{page}</DashboardLayout>;
};

export default Dashboard;

export async function getServerSideProps(context: GetServerSidePropsContext) {
	if (IS_CLOUD) {
		const { redirect } = await validateRequest(context);
		if (redirect) return { redirect };
	}

	return {
		props: {},
	};
}
