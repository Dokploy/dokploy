import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Cpu, HardDrive, Loader2, MemoryStick, Network } from "lucide-react";
import { useEffect, useState } from "react";
import { ContainerBlockChart } from "./container-block-chart";
import { ContainerCPUChart } from "./container-cpu-chart";
import { ContainerMemoryChart } from "./container-memory-chart";
import { ContainerNetworkChart } from "./container-network-chart";

const REFRESH_INTERVAL = 4500;

const DATA_POINTS_OPTIONS = {
	"50": "50 points",
	"200": "200 points",
	"500": "500 points",
	"800": "800 points",
	all: "All points",
} as const;

interface ContainerMetric {
	timestamp: string;
	CPU: number;
	Memory: {
		percentage: number;
		used: number;
		total: number;
		unit: string;
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
	BASE_URL: string;
}

export const ContainerMonitoring = ({ appName, BASE_URL }: Props) => {
	const [historicalData, setHistoricalData] = useState<ContainerMetric[]>([]);
	const [metrics, setMetrics] = useState<ContainerMetric>(
		{} as ContainerMetric,
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [dataPoints, setDataPoints] =
		useState<keyof typeof DATA_POINTS_OPTIONS>("50");

	const fetchMetrics = async () => {
		try {
			const url = new URL(`${BASE_URL}/metrics/containers`);

			if (dataPoints !== "all") {
				url.searchParams.append("limit", dataPoints);
			}

			url.searchParams.append("appName", appName);

			const response = await fetch(url.toString());

			if (!response.ok) {
				throw new Error(`Failed to fetch metrics: ${response.statusText}`);
			}

			const data = await response.json();
			if (!Array.isArray(data) || data.length === 0) {
				throw new Error("No data available");
			}

			setHistoricalData(data);
			setMetrics(data[data.length - 1]);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch metrics");
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchMetrics();

		const interval = setInterval(() => {
			fetchMetrics();
		}, REFRESH_INTERVAL);

		return () => clearInterval(interval);
	}, [dataPoints, appName]);

	if (isLoading) {
		return (
			<div className="flex h-[400px] w-full items-center justify-center border rounded-lg">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="mt-5 flex min-h-[55vh] w-full items-center justify-center rounded-lg border p-4">
				<span className="text-base font-medium leading-none text-muted-foreground">
					Error fetching metrics from: {BASE_URL}{" "}
					<strong className="font-semibold text-destructive">{error}</strong>
				</span>
			</div>
		);
	}

	return (
		<div className="space-y-4 pb-10 pt-5 w-full border p-4 rounded-lg">
			{/* Header con selector de puntos de datos */}
			<div className="flex items-center justify-between">
				<h2 className="text-2xl font-bold tracking-tight">
					Container Monitoring
				</h2>
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
				<Card className="p-6 bg-transparent">
					<div className="flex items-center gap-2">
						<Cpu className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">CPU Usage</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">{metrics.CPU}%</p>
				</Card>

				<Card className="p-6 bg-transparent">
					<div className="flex items-center gap-2">
						<MemoryStick className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Memory Usage</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">{metrics.Memory.percentage}%</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{metrics.Memory.used} {metrics.Memory.unit} / {metrics.Memory.total} {metrics.Memory.unit}
					</p>
				</Card>

				<Card className="p-6 bg-transparent">
					<div className="flex items-center gap-2">
						<Network className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Network I/O</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">{metrics.Network.input} {metrics.Network.inputUnit} / {metrics.Network.output} {metrics.Network.outputUnit}</p>
				</Card>

				<Card className="p-6 bg-transparent">
					<div className="flex items-center gap-2">
						<HardDrive className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-sm font-medium">Block I/O</h3>
					</div>
					<p className="mt-2 text-2xl font-bold">{metrics.BlockIO.read} {metrics.BlockIO.readUnit} / {metrics.BlockIO.write} {metrics.BlockIO.writeUnit}</p>
				</Card>
			</div>

			{/* Container Information */}
			<Card className="p-6 bg-transparent">
				<h3 className="text-lg font-medium mb-4">Container Information</h3>
				<div className="grid gap-4 md:grid-cols-2">
					<div>
						<h4 className="text-sm font-medium text-muted-foreground">
							Container ID
						</h4>
						<p className="mt-1">{metrics.ID}</p>
					</div>
					<div>
						<h4 className="text-sm font-medium text-muted-foreground">Name</h4>
						<p className="mt-1">{metrics.Name}</p>
					</div>
				</div>
			</Card>

			{/* Charts Grid */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
				<ContainerCPUChart data={historicalData} />
				<ContainerMemoryChart data={historicalData} />
				<ContainerBlockChart data={historicalData} />
				<ContainerNetworkChart data={historicalData} />
			</div>
		</div>
	);
};
