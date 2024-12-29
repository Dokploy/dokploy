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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const REFRESH_INTERVAL = 4500;
// const BASE_URL =
// 	process.env.NEXT_PUBLIC_METRICS_URL || "http://localhost:3001/metrics";

const DATA_POINTS_OPTIONS = {
	"50": "50 points",
	"200": "200 points",
	"500": "500 points",
	"800": "800 points",
	all: "All points",
} as const;

interface SystemMetrics {
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

interface Props {
	BASE_URL?: string;
}

export const ShowMonitoring = ({
	BASE_URL = process.env.NEXT_PUBLIC_METRICS_URL ||
		"http://localhost:3001/metrics",
}: Props) => {
	const [historicalData, setHistoricalData] = useState<SystemMetrics[]>([]);
	const [metrics, setMetrics] = useState<SystemMetrics>({} as SystemMetrics);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [dataPoints, setDataPoints] =
		useState<keyof typeof DATA_POINTS_OPTIONS>("50");

	const fetchMetrics = async () => {
		try {
			const url = new URL(BASE_URL);

			// Solo añadir el parámetro limit si no es "all"
			if (dataPoints !== "all") {
				url.searchParams.append("limit", dataPoints);
			}

			const response = await fetch(url.toString());

			if (!response.ok) {
				throw new Error(`Failed to fetch metrics: ${response.statusText}`);
			}

			const data = await response.json();
			if (!Array.isArray(data) || data.length === 0) {
				throw new Error("No hay datos disponibles");
			}

			const formattedData = data.map((metric: SystemMetrics) => ({
				timestamp: metric.timestamp,
				cpu: Number.parseFloat(metric.cpu),
				cpuModel: metric.cpuModel,
				cpuCores: metric.cpuCores,
				cpuPhysicalCores: metric.cpuPhysicalCores,
				cpuSpeed: metric.cpuSpeed,
				os: metric.os,
				distro: metric.distro,
				kernel: metric.kernel,
				arch: metric.arch,
				memUsed: Number.parseFloat(metric.memUsed),
				memUsedGB: Number.parseFloat(metric.memUsedGB),
				memTotal: Number.parseFloat(metric.memTotal),
				networkIn: Number.parseFloat(metric.networkIn),
				networkOut: Number.parseFloat(metric.networkOut),
				diskUsed: Number.parseFloat(metric.diskUsed),
				totalDisk: Number.parseFloat(metric.totalDisk),
				uptime: metric.uptime,
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
	}, [dataPoints]);

	if (isLoading) {
		return (
			<div className="flex h-[400px] w-full items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="mt-5 border p-4 rounded-lg min-h-[55vh] flex items-center justify-center w-full">
				<span className="text-base font-medium leading-none text-muted-foreground">
					Error fetching metrics to: {BASE_URL}
					<strong className="font-semibold text-destructive">{error}</strong>
				</span>
			</div>
		);
	}

	return (
		<div className="space-y-4 pt-5 pb-10 w-full">
			{/* Header con selector de puntos de datos */}
			<div className="flex justify-between items-center">
				<h2 className="text-2xl font-bold tracking-tight">System Monitoring</h2>
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">Data points:</span>
					<Select
						value={dataPoints}
						onValueChange={(value: keyof typeof DATA_POINTS_OPTIONS) =>
							setDataPoints(value)
						}
					>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Select points" />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(DATA_POINTS_OPTIONS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

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
					<p className="mt-2 text-2xl font-bold">{metrics.cpu}%</p>
				</div>

				<div className="rounded-lg border text-card-foreground bg-transparent shadow-sm p-6">
					<div className="flex items-center gap-2">
						<MemoryStick className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Memory Usage</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">
						{metrics.memUsedGB} GB / {metrics.memTotal} GB
					</p>
				</div>

				<div className="rounded-lg border text-card-foreground shadow-sm p-6">
					<div className="flex items-center gap-2">
						<HardDrive className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Disk Usage</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">{metrics.diskUsed}%</p>
				</div>
			</div>

			{/* System Information */}
			<div className="rounded-lg border text-card-foreground shadow-sm p-6">
				<h3 className="text-lg font-medium mb-4">System Information</h3>
				<div className="grid gap-4 md:grid-cols-2">
					<div>
						<h4 className="text-sm font-medium text-muted-foreground">CPU</h4>
						<p className="mt-1">{metrics.cpuModel}</p>
						<p className="text-sm text-muted-foreground mt-1">
							{metrics.cpuPhysicalCores} Physical Cores ({metrics.cpuCores}{" "}
							Threads) @ {metrics.cpuSpeed}GHz
						</p>
					</div>
					<div>
						<h4 className="text-sm font-medium text-muted-foreground">
							Operating System
						</h4>
						<p className="mt-1">{metrics.distro}</p>
						<p className="text-sm text-muted-foreground mt-1">
							Kernel: {metrics.kernel} ({metrics.arch})
						</p>
					</div>
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
