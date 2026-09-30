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
	serverId: string;
	serviceId?: string;
}

export const CompactPaidContainerMonitoring = ({
	appName,
	serverId,
	serviceId,
}: Props) => {
	const [historicalData, setHistoricalData] = useState<ContainerMetric[]>([]);

	const { data, isLoading, error } =
		api.user.getContainerMetricsByServer.useQuery(
			{
				serverId,
				appName,
				dataPoints: "200",
				serviceId,
			},
			{
				refetchInterval: 10000,
				enabled: !!appName && !!serverId,
			},
		);

	useEffect(() => {
		if (!data) return;
		// @ts-ignore
		setHistoricalData(data);
	}, [data]);

	if (isLoading && historicalData.length === 0) {
		return (
			<div className="flex items-center justify-center gap-2 text-muted-foreground min-h-[200px] rounded-lg border">
				<Loader2 className="size-4 animate-spin" />
				<span className="text-sm">Loading metrics...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded-lg border p-6 text-sm text-muted-foreground">
				Unable to fetch metrics for {appName}.
			</div>
		);
	}

	if (historicalData.length === 0) {
		return (
			<div className="rounded-lg border p-6 text-sm text-muted-foreground">
				No metrics available yet for {appName}.
			</div>
		);
	}

	return (
		<div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
			<ContainerCPUChart data={historicalData} />
			<ContainerMemoryChart data={historicalData} />
		</div>
	);
};
