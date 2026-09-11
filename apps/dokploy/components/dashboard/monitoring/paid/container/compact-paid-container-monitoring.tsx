import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/utils/api";
import { ContainerCPUChart } from "./container-cpu-chart";
import { ContainerMemoryChart } from "./container-memory-chart";

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
	label?: string;
}

export const CompactPaidContainerMonitoring = ({
	appName,
	baseUrl,
	token,
	label,
}: Props) => {
	const [historicalData, setHistoricalData] = useState<ContainerMetric[]>([]);

	const { data, isLoading, error } = api.user.getContainerMetrics.useQuery(
		{
			url: baseUrl,
			token,
			dataPoints: "200",
			appName,
		},
		{
			refetchInterval: 10000,
			enabled: !!appName && !!baseUrl && !!token,
		},
	);

	useEffect(() => {
		if (!data) return;
		// @ts-ignore
		setHistoricalData(data);
	}, [data]);

	if (isLoading && historicalData.length === 0) {
		return (
			<div className="rounded-xl bg-background p-6 flex items-center justify-center gap-2 text-muted-foreground min-h-[200px]">
				<Loader2 className="size-4 animate-spin" />
				<span className="text-sm">Loading metrics...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded-xl bg-background p-6 text-sm text-muted-foreground">
				Unable to fetch metrics for {label || appName}.
			</div>
		);
	}

	return (
		<div className="rounded-xl bg-background flex flex-col gap-4">
			{label && (
				<div className="space-y-1">
					<h2 className="text-base font-semibold tracking-tight">{label}</h2>
					<p className="text-sm text-muted-foreground">
						Watch the usage of your server in the current app
					</p>
				</div>
			)}

			{historicalData.length > 0 && (
				<div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
					<ContainerCPUChart data={historicalData} />
					<ContainerMemoryChart data={historicalData} />
				</div>
			)}
		</div>
	);
};
