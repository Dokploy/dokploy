import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import type { GetServerSidePropsContext } from "next";
import React, { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CartesianGrid, XAxis, Area, AreaChart, YAxis } from "recharts";

const REFRESH_INTERVAL = 3000;
const METRICS_URL = process.env.NEXT_PUBLIC_METRICS_URL || "http://localhost:3001/metrics";
const MAX_DATA_POINTS = 30; // Mantener 30 puntos de datos

const chartConfig = {
	cpu: {
		label: "CPU",
		color: "hsl(var(--chart-1))",
	},
	memory: {
		label: "Memoria",
		color: "hsl(var(--chart-2))",
	},
	network: {
		label: "Red",
		color: "hsl(var(--chart-3))",
	},
} satisfies ChartConfig;

const formatTimestamp = (timestamp: string | number) => {
	try {
		// Si es un string ISO, lo parseamos directamente
		if (typeof timestamp === 'string' && timestamp.includes('T')) {
			const date = new Date(timestamp);
			if (!isNaN(date.getTime())) {
				return date.toLocaleTimeString();
			}
		}
		return "Fecha inválida";
	} catch {
		return "Fecha inválida";
	}
};

const CPUChart = ({ data }: { data: any[] }) => (
	<Card className="bg-transparent">
		<CardHeader className="border-b py-5">
			<CardTitle>CPU</CardTitle>
			<CardDescription>
				Uso de CPU en los últimos minutos
			</CardDescription>
		</CardHeader>
		<CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
			<ChartContainer
				config={chartConfig}
				className="aspect-auto h-[250px] w-full"
			>
				<AreaChart data={data}>
					<defs>
						<linearGradient id="fillCPU" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
							<stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1} />
						</linearGradient>
					</defs>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="timestamp"
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						minTickGap={32}
						tickFormatter={(value) => formatTimestamp(value)}
					/>
					<ChartTooltip
						cursor={false}
						content={
							<ChartTooltipContent
								labelFormatter={(value) => formatTimestamp(value)}
								formatter={(value, name, props) => {
									// Depurar los datos
									console.log('Tooltip Data:', {
										value,
										name,
										props,
										currentPoint: props.payload[0]?.payload,
										allData: data
									});
									
									return [value];
								}}
								indicator="dot"
							/>
						}
					/>
					<Area
						name="CPU"
						dataKey="cpu"
						type="monotone"
						fill="url(#fillCPU)"
						stroke="hsl(var(--chart-1))"
						strokeWidth={2}
					/>
					<ChartLegend content={<ChartLegendContent />} />
				</AreaChart>
			</ChartContainer>
		</CardContent>
	</Card>
);

const MemoryChart = ({ data }: { data: any[] }) => {
	const latestData = data[data.length - 1] || {};
	return (
		<Card className="bg-transparent">
			<CardHeader className="border-b py-5">
				<CardTitle>Memoria</CardTitle>
				<CardDescription>
					Uso de memoria: {latestData.memUsedGB} GB de {latestData.memTotal} GB ({latestData.memUsed}%)
				</CardDescription>
			</CardHeader>
			<CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
				<ChartContainer
					config={chartConfig}
					className="aspect-auto h-[250px] w-full"
				>
					<AreaChart data={data}>
						<defs>
							<linearGradient id="fillMemory" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8} />
								<stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1} />
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} />
						<XAxis
							dataKey="timestamp"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							minTickGap={32}
							tickFormatter={(value) => formatTimestamp(value)}
						/>
						<YAxis
							yAxisId="left"
							orientation="left"
							tickFormatter={(value) => `${value}%`}
							domain={[0, 100]}
						/>
						<YAxis
							yAxisId="right"
							orientation="right"
							tickFormatter={(value) => `${value.toFixed(1)} GB`}
							domain={[0, Math.ceil(parseFloat(latestData.memTotal || "0"))]}
						/>
						<ChartTooltip
							cursor={false}
							content={({ active, payload, label }) => {
								if (active && payload && payload.length) {
									const data = payload[0].payload;
									return (
										<div className="rounded-lg border bg-background p-2 shadow-sm">
											<div className="grid grid-cols-2 gap-2">
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														Tiempo
													</span>
													<span className="font-bold">
														{formatTimestamp(label)}
													</span>
												</div>
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														Memoria
													</span>
													<span className="font-bold">
														{data.memUsed}% ({data.memUsedGB} GB)
													</span>
												</div>
											</div>
										</div>
									);
								}
								return null;
							}}
						/>
						<Area
							yAxisId="left"
							name="Memoria Usada"
							dataKey="memUsed"
							type="monotone"
							fill="url(#fillMemory)"
							stroke="hsl(var(--chart-2))"
							strokeWidth={2}
						/>
						<ChartLegend content={<ChartLegendContent />} />
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
};

const NetworkChart = ({ data }: { data: any[] }) => (
	<Card className="bg-transparent">
		<CardHeader className="border-b py-5">
			<CardTitle>Tráfico de Red</CardTitle>
			<CardDescription>
				Tráfico de red entrante y saliente
			</CardDescription>
		</CardHeader>
		<CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
			<ChartContainer
				config={chartConfig}
				className="aspect-auto h-[250px] w-full"
			>
				<AreaChart data={data}>
					<defs>
						<linearGradient id="fillNetIn" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8} />
							<stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1} />
						</linearGradient>
						<linearGradient id="fillNetOut" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.8} />
							<stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0.1} />
						</linearGradient>
					</defs>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="timestamp"
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						minTickGap={32}
						tickFormatter={(value) => formatTimestamp(value)}
					/>
					<ChartTooltip
						cursor={false}
						content={
							<ChartTooltipContent
								labelFormatter={(value) => formatTimestamp(value)}
								formatter={(value, name, props) => {
									// Depurar los datos
									console.log('Tooltip Data:', {
										value,
										name,
										props,
										currentPoint: props.payload[0]?.payload,
										allData: data
									});
									
									return [value];
								}}
								indicator="dot"
							/>
						}
					/>
					<Area
						name="Entrada"
						dataKey="networkIn"
						type="monotone"
						fill="url(#fillNetIn)"
						stroke="hsl(var(--chart-2))"
						strokeWidth={2}
					/>
					<Area
						name="Salida"
						dataKey="networkOut"
						type="monotone"
						fill="url(#fillNetOut)"
						stroke="hsl(var(--chart-3))"
						strokeWidth={2}
					/>
					<ChartLegend content={<ChartLegendContent />} />
				</AreaChart>
			</ChartContainer>
		</CardContent>
	</Card>
);

const Dashboard = () => {
	const [metrics, setMetrics] = useState(null);
	const [error, setError] = useState(null);
	const [historicalData, setHistoricalData] = useState<any[]>([]);

	const fetchMetrics = async () => {
		try {
			const response = await fetch(METRICS_URL);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			if (!Array.isArray(data) || data.length === 0) {
				throw new Error("No hay datos disponibles");
			}

			const latestMetric = data[data.length - 1];
			setMetrics(latestMetric);
			
			// Depurar los datos que llegan
			console.log('Raw Metrics:', data[data.length - 1]);
			
			const formattedData = data.map(metric => {
				const formatted = {
					timestamp: metric.timestamp,
					cpu: parseFloat(metric.cpu),
					memUsed: parseFloat(metric.memUsed),
					memUsedGB: parseFloat(metric.memUsedGB),
					memTotal: parseFloat(metric.memTotal),
					networkIn: parseFloat(metric.networkIn),
					networkOut: parseFloat(metric.networkOut),
				};
				console.log('Formatted Metric:', formatted);
				return formatted;
			});
			
			setHistoricalData(formattedData);

			setError(null);
		} catch (err) {
			console.error("Error fetching metrics:", err);
			setError(err.message || "Error al obtener métricas");
		}
	};

	useEffect(() => {
		fetchMetrics();
		const intervalId = setInterval(fetchMetrics, REFRESH_INTERVAL);
		return () => clearInterval(intervalId);
	}, []);

	if (error) {
		return (
			<div className="flex items-center justify-center min-h-[200px]">
				<div className="text-center text-red-500">
					<p>Error: {error}</p>
					<button
						onClick={fetchMetrics}
						className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
					>
						Reintentar
					</button>
				</div>
			</div>
		);
	}

	if (!metrics) {
		return (
			<div className="flex items-center justify-center min-h-[200px]">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
					<p>Cargando métricas...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-4 space-y-6">
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<MetricCard title="CPU" value={`${metrics.cpu}%`} />
				<MetricCard title="Memoria Total" value={`${metrics.totalMem} MB`} />
				<MetricCard title="Memoria Usada" value={`${metrics.memUsed}%`} />
				<MetricCard title="Uptime" value={formatUptime(metrics.uptime)} />
				<MetricCard title="Disco Usado" value={`${metrics.diskUsed}%`} />
				<MetricCard title="Disco Total" value={`${metrics.totalDisk} GB`} />
				<MetricCard title="Red Entrada" value={`${metrics.networkIn} MB`} />
				<MetricCard title="Red Salida" value={`${metrics.networkOut} MB`} />
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<CPUChart data={historicalData} />
				<MemoryChart data={historicalData} />
			</div>

			<NetworkChart data={historicalData} />

			<div className="mt-4 text-sm text-gray-500">
				Última actualización: {formatTimestamp(metrics.timestamp)}
			</div>
		</div>
	);
};

const MetricCard = ({ title, value }: { title: string; value: string }) => (
	<div className="border p-4 rounded-lg shadow">
		<h3 className="text-lg font-semibold text-primary">{title}</h3>
		<p className="text-2xl font-bold text-muted-foreground">{value}</p>
	</div>
);

const formatUptime = (seconds: number): string => {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${days}d ${hours}h ${minutes}m`;
};

Dashboard.getLayout = (page: ReactElement) => {
	return <DashboardLayout tab={"monitoring"}>{page}</DashboardLayout>;
};

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
	if (IS_CLOUD) {
		return {
			redirect: {
				permanent: true,
				destination: "/dashboard/projects",
			},
		};
	}
	const { user } = await validateRequest(ctx.req, ctx.res);
	if (!user) {
		return {
			redirect: {
				permanent: true,
				destination: "/",
			},
		};
	}
	return { props: {} };
};

export default Dashboard;
