import { Cpu, HardDrive, Loader2, MemoryStick, Network } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "next-i18next";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { ContainerBlockChart } from "./container-block-chart";
import { ContainerCPUChart } from "./container-cpu-chart";
import { ContainerMemoryChart } from "./container-memory-chart";
import { ContainerNetworkChart } from "./container-network-chart";

const REFRESH_INTERVALS = {
	"5000": "monitoring.refresh.5s",
	"10000": "monitoring.refresh.10s",
	"20000": "monitoring.refresh.20s",
	"30000": "monitoring.refresh.30s",
} as const;

const DATA_POINTS_OPTIONS = {
	"50": "monitoring.dataPoints.50",
	"200": "monitoring.dataPoints.200",
	"500": "monitoring.dataPoints.500",
	"800": "monitoring.dataPoints.800",
	"1200": "monitoring.dataPoints.1200",
	"1600": "monitoring.dataPoints.1600",
	"2000": "monitoring.dataPoints.2000",
	all: "monitoring.dataPoints.all",
} as const;

interface ContainerMetric {
	timestamp: string;
	CPU: number;
	Memory: {
		percentage: number;
		used: number;
		total: number;
		unit: string;
		usedUnit: string;
		totalUnit: string;
	};
	Network: {
		input: number;
		output: number;
		inputUnit: string;
		outputUnit: string;
	};
	BlockIO: {
		read: number;
		write: number;
		readUnit: string;
		writeUnit: string;
	};
	Container: string;
	ID: string;
	Name: string;
}

interface Props {
	appName: string;
	baseUrl: string;
	token: string;
}

export const ContainerPaidMonitoring = ({ appName, baseUrl, token }: Props) => {
	const { t } = useTranslation("common");
	const [historicalData, setHistoricalData] = useState<ContainerMetric[]>([]);
	const [metrics, setMetrics] = useState<ContainerMetric>(
		{} as ContainerMetric,
	);
	const [dataPoints, setDataPoints] =
		useState<keyof typeof DATA_POINTS_OPTIONS>("50");
	const [refreshInterval, setRefreshInterval] = useState<string>("5000");

	const {
		data,
		isLoading,
		error: queryError,
	} = api.user.getContainerMetrics.useQuery(
		{
			url: baseUrl,
			token,
			dataPoints,
			appName,
		},
		{
			refetchInterval:
				dataPoints === "all" ? undefined : Number.parseInt(refreshInterval),
			enabled: !!appName,
		},
	);

	useEffect(() => {
		if (!data) return;

		// @ts-ignore
		setHistoricalData(data);
		// @ts-ignore
		setMetrics(data[data.length - 1]);
	}, [data]);

	if (isLoading) {
		return (
			<div className="flex h-[400px] w-full items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (queryError) {
		return (
			<div className="mt-5 flex min-h-[55vh] w-full items-center justify-center p-4">
				<div className="max-w-xl text-center">
					<p className="mb-2 text-base font-medium leading-none text-muted-foreground">
						{t("monitoring.error.fetchMetricsTitle", { appName })}
					</p>
					<p className="whitespace-pre-line text-sm text-destructive">
						{queryError instanceof Error
								? queryError.message
								: t("monitoring.error.fetchMetricsDescription")}
					</p>
					<p className="text-sm text-muted-foreground">
						{t("monitoring.error.urlLabel")} {baseUrl}
					</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="flex items-center justify-between flex-wrap	 gap-2">
				<h2 className="text-2xl font-bold tracking-tight">
					{t("monitoring.container.title")}
				</h2>
				<div className="flex items-center gap-4 flex-wrap">
					<div>
						<span className="text-sm text-muted-foreground">
							{t("monitoring.container.dataPointsLabel")}
						</span>
						<Select
							value={dataPoints}
							onValueChange={(value: keyof typeof DATA_POINTS_OPTIONS) =>
								setDataPoints(value)
							}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue
									placeholder={t(
										"monitoring.container.dataPoints.placeholder",
									)}
								/>
							</SelectTrigger>
							<SelectContent>
								{Object.entries(DATA_POINTS_OPTIONS).map(
									([value, labelKey]) => (
										<SelectItem key={value} value={value}>
											{t(labelKey as string)}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
					</div>

					<div>
						<span className="text-sm text-muted-foreground">
							{t("monitoring.container.refreshLabel")}
						</span>
						<Select
							value={refreshInterval}
							onValueChange={(value: keyof typeof REFRESH_INTERVALS) =>
								setRefreshInterval(value)
							}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue
									placeholder={t(
										"monitoring.container.refresh.placeholder",
									)}
								/>
							</SelectTrigger>
							<SelectContent>
								{Object.entries(REFRESH_INTERVALS).map(
									([value, labelKey]) => (
										<SelectItem key={value} value={value}>
											{t(labelKey as string)}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>

			{/* Stats Cards */}
			<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
				<Card className="p-6 bg-transparent">
					<div className="flex items-center gap-2">
						<Cpu className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">
							{t("monitoring.card.cpu")}
						</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">{metrics.CPU}%</p>
				</Card>

				<Card className="p-6 bg-transparent">
					<div className="flex items-center gap-2">
						<MemoryStick className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">
							{t("monitoring.card.memory")}
						</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">
						{metrics?.Memory?.percentage}%
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{metrics?.Memory?.used} {metrics?.Memory?.unit} /{" "}
						{metrics?.Memory?.total} {metrics?.Memory?.unit}
					</p>
				</Card>

				<Card className="p-6 bg-transparent">
					<div className="flex items-center gap-2">
						<Network className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">
							{t("monitoring.card.networkIO")}
						</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">
						{metrics?.Network?.input} {metrics?.Network?.inputUnit} /{" "}
						{metrics?.Network?.output} {metrics?.Network?.outputUnit}
					</p>
				</Card>

				<Card className="p-6 bg-transparent">
					<div className="flex items-center gap-2">
						<HardDrive className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">
							{t("monitoring.card.blockIO")}
						</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">
						{metrics?.BlockIO?.read} {metrics?.BlockIO?.readUnit} /{" "}
						{metrics?.BlockIO?.write} {metrics?.BlockIO?.writeUnit}
					</p>
				</Card>
			</div>

			{/* Container Information */}
			<Card className="p-6 bg-transparent">
				<h3 className="text-lg font-medium mb-4">
					{t("monitoring.container.infoTitle")}
				</h3>
				<div className="grid gap-4 md:grid-cols-2">
					<div>
						<h4 className="text-sm font-medium text-muted-foreground">
							{t("monitoring.container.info.id")}
						</h4>
						<p className="mt-1">{metrics.ID}</p>
					</div>
					<div>
						<h4 className="text-sm font-medium text-muted-foreground">
							{t("monitoring.container.info.name")}
						</h4>
						<p className="mt-1 truncate">{metrics.Name}</p>
					</div>
				</div>
			</Card>

			{/* Charts Grid */}
			<div className="grid gap-4 grid-cols-1 md:grid-cols-1 xl:grid-cols-2">
				<ContainerCPUChart data={historicalData} />
				<ContainerMemoryChart data={historicalData} />
				<ContainerBlockChart data={historicalData} />
				<ContainerNetworkChart data={historicalData} />
			</div>
		</>
	);
};
