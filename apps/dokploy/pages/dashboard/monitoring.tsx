import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { IS_CLOUD, validateRequest } from "@dokploy/server";
import type { GetServerSidePropsContext } from "next";
import type React from "react";
import { useEffect, useState } from "react";
import { CPUChart } from "@/components/metrics/cpu-chart";
import { MemoryChart } from "@/components/metrics/memory-chart";
import { NetworkChart } from "@/components/metrics/network-chart";
import { DiskChart } from "@/components/metrics/disk-chart";

const REFRESH_INTERVAL = 3000;
const METRICS_URL =
	process.env.NEXT_PUBLIC_METRICS_URL || "http://localhost:3001/metrics";
const MAX_DATA_POINTS = 30;

const Dashboard = () => {
	const [metrics, setMetrics] = useState<any>({});
	const [historicalData, setHistoricalData] = useState<any[]>([]);
	const [error, setError] = useState<string | null>(null);

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

			const formattedData = data.map((metric) => ({
				timestamp: metric.timestamp,
				cpu: parseFloat(metric.cpu),
				memUsed: parseFloat(metric.memUsed),
				memUsedGB: parseFloat(metric.memUsedGB),
				memTotal: parseFloat(metric.memTotal),
				networkIn: parseFloat(metric.networkIn),
				networkOut: parseFloat(metric.networkOut),
				diskUsed: parseFloat(metric.diskUsed),
				totalDisk: parseFloat(metric.totalDisk),
			}));

			setHistoricalData(formattedData);
			setError(null);
		} catch (err) {
			console.error("Error fetching metrics:", err);
			setError(err.message || "Error al obtener métricas");
		}
	};

	useEffect(() => {
		fetchMetrics();
		const interval = setInterval(fetchMetrics, REFRESH_INTERVAL);
		return () => clearInterval(interval);
	}, []);

	if (error) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<h2 className="text-lg font-semibold">Error</h2>
					<p className="text-sm text-muted-foreground">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 pt-5 pb-10">
			<CPUChart data={historicalData} />
			<MemoryChart data={historicalData} />
			<DiskChart data={metrics} />
			<NetworkChart data={historicalData} />
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
