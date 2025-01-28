import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Clock, Cpu, HardDrive, Loader2, MemoryStick } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { CPUChart } from "./cpu-chart";
import { DiskChart } from "./disk-chart";
import { MemoryChart } from "./memory-chart";
import { NetworkChart } from "./network-chart";

const REFRESH_INTERVALS = {
	"5000": "5 Seconds",
	"10000": "10 Seconds",
	"20000": "20 Seconds",
	"30000": "30 Seconds",
} as const;

const DATA_POINTS_OPTIONS = {
	"50": "50 points",
	"200": "200 points",
	"500": "500 points",
	"800": "800 points",
	"1200": "1200 points",
	"1600": "1600 points",
	"2000": "2000 points",
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
	token?: string;
}

export const ShowPaidMonitoring = ({
	BASE_URL = process.env.NEXT_PUBLIC_METRICS_URL ||
		"http://localhost:3001/metrics",
	token = process.env.NEXT_PUBLIC_METRICS_TOKEN || "my-token",
}: Props) => {
	const [historicalData, setHistoricalData] = useState<SystemMetrics[]>([]);
	const [metrics, setMetrics] = useState<SystemMetrics>({} as SystemMetrics);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [dataPoints, setDataPoints] =
		useState<keyof typeof DATA_POINTS_OPTIONS>("50");
	const [refreshInterval, setRefreshInterval] = useState<string>("5000");

	const fetchMetrics = async () => {
		try {
			const url = new URL(BASE_URL);
			url.searchParams.append("limit", dataPoints);
			const response = await fetch(url.toString(), {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				throw new Error(
					`Error ${response.status}: ${response.statusText}. Ensure the container is running and this service is included in the monitoring configuration.`,
				);
			}

			const data = await response.json();
			if (!Array.isArray(data) || data.length === 0) {
				throw new Error(
					[
						"No monitoring data available. This could be because:",
						"",
						"1. You don't have setup the monitoring service, you can do in web server section.",
						"2. If you already have setup the monitoring service, wait a few minutes and refresh the page.",
					].join("\n"),
				);
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

			// @ts-ignore
			setHistoricalData(formattedData);
			// @ts-ignore
			setMetrics(formattedData[formattedData.length - 1] || {});
			setError(null);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to fetch metrics, Please check your monitoring Instance is Configured correctly.",
			);
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

		if (dataPoints === "all") {
			return;
		}

		const interval = setInterval(() => {
			fetchMetrics();
		}, Number(refreshInterval));

		return () => clearInterval(interval);
	}, [dataPoints, token, refreshInterval]);

	if (isLoading) {
		return (
			<div className="flex h-[400px] w-full items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-[55vh] w-full items-center justify-center p-4">
				<div className="max-w-xl text-center">
					<p className="mb-2 text-base font-medium leading-none text-muted-foreground">
						Error fetching metrics{" "}
					</p>
					<p className="whitespace-pre-line text-sm text-destructive">
						{error}
					</p>
					<p className=" text-sm text-muted-foreground">URL: {BASE_URL}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4 pt-5 pb-10 w-full px-4">
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
					<span className="text-sm text-muted-foreground">
						Refresh interval:
					</span>
					<Select
						value={refreshInterval}
						onValueChange={(value: keyof typeof REFRESH_INTERVALS) =>
							setRefreshInterval(value)
						}
					>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Select interval" />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(REFRESH_INTERVALS).map(([value, label]) => (
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
