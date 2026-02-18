import { Clock, Cpu, HardDrive, Loader2, MemoryStick } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { ContainerPaidMonitoring } from "../container/show-paid-container-monitoring";
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
	serverId?: string;
}

interface MonitoringResource {
	key: string;
	projectId: string;
	projectName: string;
	appName: string;
	label: string;
	type: string;
	serverId?: string | null;
}

const getContainerMetricsBaseUrl = (url: string) =>
	url.replace(/\/?metrics\/?$/, "");

export const ShowPaidMonitoring = ({
	BASE_URL = process.env.NEXT_PUBLIC_METRICS_URL ||
		"http://localhost:3001/metrics",
	token = process.env.NEXT_PUBLIC_METRICS_TOKEN || "my-token",
	serverId,
}: Props) => {
	const [historicalData, setHistoricalData] = useState<SystemMetrics[]>([]);
	const [metrics, setMetrics] = useState<SystemMetrics>({} as SystemMetrics);
	const [dataPoints, setDataPoints] =
		useState<keyof typeof DATA_POINTS_OPTIONS>("50");
	const [refreshInterval, setRefreshInterval] = useState<string>("5000");
	const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
	const [selectedResourceKey, setSelectedResourceKey] = useState<string>("");

	const { data: projects } = api.project.all.useQuery(undefined, {
		refetchOnWindowFocus: false,
	});

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
				dataPoints === "all" ? undefined : Number.parseInt(refreshInterval),
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

	const resources = useMemo<MonitoringResource[]>(() => {
		if (!projects) {
			return [];
		}

		const allResources = projects.flatMap((project) => {
			const projectId = project.projectId;
			const projectName = project.name;

			return project.environments.flatMap((environment) => [
				...environment.applications.map((app) => ({
					key: `application-${app.applicationId}`,
					projectId,
					projectName,
					appName: app.appName,
					label: app.name,
					type: "Application",
					serverId: app.serverId,
				})),
				...environment.compose.map((service) => ({
					key: `compose-${service.composeId}`,
					projectId,
					projectName,
					appName: service.appName,
					label: service.name,
					type: "Compose",
					serverId: service.serverId,
				})),
				...environment.postgres.map((service) => ({
					key: `postgres-${service.postgresId}`,
					projectId,
					projectName,
					appName: service.appName,
					label: service.name,
					type: "Postgres",
					serverId: service.serverId,
				})),
				...environment.redis.map((service) => ({
					key: `redis-${service.redisId}`,
					projectId,
					projectName,
					appName: service.appName,
					label: service.name,
					type: "Redis",
					serverId: service.serverId,
				})),
				...environment.mysql.map((service) => ({
					key: `mysql-${service.mysqlId}`,
					projectId,
					projectName,
					appName: service.appName,
					label: service.name,
					type: "MySQL",
					serverId: service.serverId,
				})),
				...environment.mongo.map((service) => ({
					key: `mongo-${service.mongoId}`,
					projectId,
					projectName,
					appName: service.appName,
					label: service.name,
					type: "MongoDB",
					serverId: service.serverId,
				})),
				...environment.mariadb.map((service) => ({
					key: `mariadb-${service.mariadbId}`,
					projectId,
					projectName,
					appName: service.appName,
					label: service.name,
					type: "MariaDB",
					serverId: service.serverId,
				})),
			]);
		});

		return allResources.filter(
			(resource) =>
				Boolean(resource.appName) &&
				(!serverId || resource.serverId === serverId),
		);
	}, [projects, serverId]);

	const projectOptions = useMemo(
		() =>
			Array.from(
				new Map(
					resources.map((resource) => [
						resource.projectId,
						{
							projectId: resource.projectId,
							projectName: resource.projectName,
						},
					]),
				).values(),
			),
		[resources],
	);

	const resourceOptions = useMemo(
		() =>
			selectedProjectId === "all"
				? []
				: resources.filter((resource) => resource.projectId === selectedProjectId),
		[resources, selectedProjectId],
	);

	const selectedResource = useMemo(
		() =>
			resourceOptions.find((resource) => resource.key === selectedResourceKey),
		[resourceOptions, selectedResourceKey],
	);

	useEffect(() => {
		if (selectedProjectId === "all") {
			setSelectedResourceKey("");
			return;
		}

		if (resourceOptions.length === 0) {
			setSelectedResourceKey("");
			return;
		}

		const hasSelectedResource = resourceOptions.some(
			(resource) => resource.key === selectedResourceKey,
		);

		if (!hasSelectedResource) {
			setSelectedResourceKey("");
		}
	}, [resourceOptions, selectedProjectId, selectedResourceKey]);

	const formatUptime = (seconds: number): string => {
		const days = Math.floor(seconds / (24 * 60 * 60));
		const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
		const minutes = Math.floor((seconds % (60 * 60)) / 60);

		return `${days}d ${hours}h ${minutes}m`;
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
			<div className="flex min-h-[55vh] w-full items-center justify-center p-4">
				<div className="max-w-xl text-center">
					<p className="mb-2 text-base font-medium leading-none text-muted-foreground">
						Error fetching metrics{" "}
					</p>
					<p className="whitespace-pre-line text-sm text-destructive">
						{queryError instanceof Error
							? queryError.message
							: "Failed to fetch metrics, Please check your monitoring Instance is Configured correctly."}
					</p>
					<p className="text-sm text-muted-foreground">URL: {BASE_URL}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4 pt-5 pb-10 w-full md:px-4">
			<div className="flex items-center justify-between flex-wrap	 gap-2">
				<h2 className="text-2xl font-bold tracking-tight">System Monitoring</h2>
				<div className="flex items-center gap-4 flex-wrap">
					<div>
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

					<div>
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
			</div>

			<div className="flex items-center gap-4 flex-wrap">
				<div>
					<span className="text-sm text-muted-foreground">Project:</span>
					<Select
						value={selectedProjectId}
						onValueChange={(value) => {
							setSelectedProjectId(value);
							setSelectedResourceKey("");
						}}
					>
						<SelectTrigger className="w-[240px]">
							<SelectValue placeholder="Whole server (default)" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Whole server (default)</SelectItem>
							{projectOptions.map((project) => (
								<SelectItem key={project.projectId} value={project.projectId}>
									{project.projectName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div>
					<span className="text-sm text-muted-foreground">
						Application or resource:
					</span>
					<Select
						value={selectedResourceKey}
						onValueChange={setSelectedResourceKey}
						disabled={selectedProjectId === "all" || resourceOptions.length === 0}
					>
						<SelectTrigger className="w-[320px]">
							<SelectValue placeholder="Select an application or resource" />
						</SelectTrigger>
						<SelectContent>
							{resourceOptions.map((resource) => (
								<SelectItem key={resource.key} value={resource.key}>
									{resource.label} ({resource.type})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Stats Cards */}
			<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
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
			<div className="grid gap-4 grid-cols-1 md:grid-cols-1 xl:grid-cols-2">
				<CPUChart data={historicalData} />
				<MemoryChart data={historicalData} />
				<DiskChart data={metrics} />
				<NetworkChart data={historicalData} />
			</div>

			<div className="rounded-lg border p-6 space-y-4">
				<h3 className="text-lg font-medium">Resource Monitoring</h3>
				{selectedResource ? (
					<ContainerPaidMonitoring
						appName={selectedResource.appName}
						baseUrl={getContainerMetricsBaseUrl(BASE_URL)}
						token={token}
					/>
				) : (
					<p className="text-sm text-muted-foreground">
						Whole-server monitoring is active. Select a project and resource to
						filter.
					</p>
				)}
			</div>
		</div>
	);
};
