import { Clock, Cpu, HardDrive, Loader2, MemoryStick } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { CPUChart } from "./cpu-chart";
import { DiskChart } from "./disk-chart";
import { MemoryChart } from "./memory-chart";
import { NetworkChart } from "./network-chart";

const REFRESH_INTERVAL_KEYS = ["5000", "10000", "20000", "30000"] as const;

const DATA_POINT_KEYS = [
	"50",
	"200",
	"500",
	"800",
	"1200",
	"1600",
	"2000",
	"all",
] as const;

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
	const t = useTranslations("monitoringDashboard.paid");
	const tDataPoints = useTranslations("monitoringDashboard.dataPoints");
	const tRefresh = useTranslations("monitoringDashboard.refreshInterval");
	const tUptime = useTranslations("monitoringDashboard.uptime");
	const [historicalData, setHistoricalData] = useState<SystemMetrics[]>([]);
	const [metrics, setMetrics] = useState<SystemMetrics>({} as SystemMetrics);
	const [dataPoints, setDataPoints] =
		useState<(typeof DATA_POINT_KEYS)[number]>("50");
	const [refreshInterval, setRefreshInterval] =
		useState<(typeof REFRESH_INTERVAL_KEYS)[number]>("5000");

	const {
		data,
		isLoading,
		error: queryError,
	} = api.server.getServerMetrics.useQuery(
		{
			url: BASE_URL,
			token,
			dataPoints,
		},
		{
			refetchInterval:
				dataPoints === "all" ? undefined : Number.parseInt(refreshInterval, 10),
			enabled: true,
		},
	);

	useEffect(() => {
		if (!data) return;

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
	}, [data]);

	const formatUptime = (seconds: number): string => {
		const days = Math.floor(seconds / (24 * 60 * 60));
		const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
		const minutes = Math.floor((seconds % (60 * 60)) / 60);

		return tUptime("format", {
			days: String(days),
			hours: String(hours),
			minutes: String(minutes),
		});
	};

	if (isLoading) {
		return (
			<div className="flex h-[400px] w-full items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (queryError) {
		return (
			<div className="flex w-full items-center justify-center p-4 py-24">
				<div className="max-w-xl text-center">
					<p className="mb-2 text-base font-medium leading-none text-muted-foreground">
						{t("errorFetch")}{" "}
					</p>
					<p className="whitespace-pre-line text-sm text-destructive">
						{queryError instanceof Error
							? queryError.message
							: t("fetchFallback")}
					</p>
					<p className="text-sm text-muted-foreground">
						{t("urlLabel")}: {BASE_URL}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4 pt-5 pb-10 w-full md:px-4">
			<div className="flex items-center justify-between flex-wrap	 gap-2">
				<h2 className="text-2xl font-bold tracking-tight">
					{t("systemMonitoring")}
				</h2>
				<div className="flex items-center gap-4 flex-wrap">
					<div>
						<span className="text-sm text-muted-foreground">
							{t("dataPointsLabel")}
						</span>
						<Select
							value={dataPoints}
							onValueChange={(value: (typeof DATA_POINT_KEYS)[number]) =>
								setDataPoints(value)
							}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue placeholder={t("selectPointsPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{DATA_POINT_KEYS.map((value) => (
									<SelectItem key={value} value={value}>
										{tDataPoints(value)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div>
						<span className="text-sm text-muted-foreground">
							{t("refreshIntervalLabel")}
						</span>
						<Select
							value={refreshInterval}
							onValueChange={(value: (typeof REFRESH_INTERVAL_KEYS)[number]) =>
								setRefreshInterval(value)
							}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue placeholder={t("selectIntervalPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{REFRESH_INTERVAL_KEYS.map((value) => (
									<SelectItem key={value} value={value}>
										{tRefresh(value)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>

			{/* Stats Cards */}
			<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-lg border text-card-foreground shadow-sm p-6">
					<div className="flex items-center gap-2">
						<Clock className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">{t("uptime")}</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">
						{formatUptime(metrics.uptime || 0)}
					</p>
				</div>

				<div className="rounded-lg border text-card-foreground shadow-sm p-6">
					<div className="flex items-center gap-2">
						<Cpu className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">{t("cpuUsage")}</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">{metrics.cpu}%</p>
				</div>

				<div className="rounded-lg border text-card-foreground bg-transparent shadow-sm p-6">
					<div className="flex items-center gap-2">
						<MemoryStick className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">{t("memoryUsage")}</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">
						{metrics.memUsedGB} GB / {metrics.memTotal} GB
					</p>
				</div>

				<div className="rounded-lg border text-card-foreground shadow-sm p-6">
					<div className="flex items-center gap-2">
						<HardDrive className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">{t("diskUsage")}</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">{metrics.diskUsed}%</p>
				</div>
			</div>

			{/* System Information */}
			<div className="rounded-lg border text-card-foreground shadow-sm p-6">
				<h3 className="text-lg font-medium mb-4">{t("systemInfo")}</h3>
				<div className="grid gap-4 md:grid-cols-2">
					<div>
						<h4 className="text-sm font-medium text-muted-foreground">
							{t("cpuHeading")}
						</h4>
						<p className="mt-1">{metrics.cpuModel}</p>
						<p className="text-sm text-muted-foreground mt-1">
							{t("cpuCoresLine", {
								physical: String(metrics.cpuPhysicalCores),
								threads: String(metrics.cpuCores),
								speed: String(metrics.cpuSpeed),
							})}
						</p>
					</div>
					<div>
						<h4 className="text-sm font-medium text-muted-foreground">
							{t("operatingSystem")}
						</h4>
						<p className="mt-1">{metrics.distro}</p>
						<p className="text-sm text-muted-foreground mt-1">
							{t("kernelLine", {
								kernel: metrics.kernel,
								arch: metrics.arch,
							})}
						</p>
					</div>
				</div>
			</div>

			{/* Charts Grid */}
			<div className="grid gap-4 grid-cols-1 md:grid-cols-1 xl:grid-cols-2">
				<CPUChart data={historicalData} />
				<MemoryChart data={historicalData} />
				<DiskChart data={metrics} />
				<NetworkChart data={historicalData} />
			</div>
		</div>
	);
};
