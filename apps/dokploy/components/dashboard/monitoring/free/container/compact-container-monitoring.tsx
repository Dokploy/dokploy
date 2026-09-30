import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/utils/api";
import { DockerCpuChart } from "./docker-cpu-chart";
import { DockerMemoryChart } from "./docker-memory-chart";
import {
	type DockerStats,
	type DockerStatsJSON,
	convertMemoryToBytes,
} from "./show-free-container-monitoring";

const defaultData: DockerStats = {
	cpu: {
		value: "0%",
		time: "",
	},
	memory: {
		value: {
			used: 0,
			total: 0,
		},
		time: "",
	},
	block: {
		value: {
			readMb: 0,
			writeMb: 0,
		},
		time: "",
	},
	network: {
		value: {
			inputMb: 0,
			outputMb: 0,
		},
		time: "",
	},
	disk: {
		value: { diskTotal: 0, diskUsage: 0, diskUsedPercentage: 0, diskFree: 0 },
		time: "",
	},
};

interface Props {
	appName: string;
	appType?: "application" | "stack" | "docker-compose";
	serviceId?: string;
	containerId?: string;
}

export const CompactContainerMonitoring = ({
	appName,
	appType = "application",
	serviceId,
	containerId,
}: Props) => {
	const { data } = api.application.readAppMonitoring.useQuery(
		{ appName },
		{
			refetchOnWindowFocus: false,
			enabled: !!appName,
		},
	);
	const [accumulativeData, setAccumulativeData] = useState<DockerStatsJSON>({
		cpu: [],
		memory: [],
		block: [],
		network: [],
		disk: [],
	});
	const [currentData, setCurrentData] = useState<DockerStats>(defaultData);

	useEffect(() => {
		setCurrentData(defaultData);
		setAccumulativeData({
			cpu: [],
			memory: [],
			block: [],
			network: [],
			disk: [],
		});
	}, [appName, containerId]);

	useEffect(() => {
		if (!data) return;

		setCurrentData({
			cpu: data.cpu[data.cpu.length - 1] ?? currentData.cpu,
			memory: data.memory[data.memory.length - 1] ?? currentData.memory,
			block: data.block[data.block.length - 1] ?? currentData.block,
			network: data.network[data.network.length - 1] ?? currentData.network,
			disk: data.disk[data.disk.length - 1] ?? currentData.disk,
		});
		setAccumulativeData({
			block: data?.block || [],
			cpu: data?.cpu || [],
			disk: data?.disk || [],
			memory: data?.memory || [],
			network: data?.network || [],
		});
	}, [data]);

	useEffect(() => {
		if (!appName) return;

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const params = new URLSearchParams({
			appName,
			appType,
		});
		if (serviceId) {
			params.set("serviceId", serviceId);
		}
		if (containerId) {
			params.set("containerId", containerId);
		}
		const wsUrl = `${protocol}//${window.location.host}/listen-docker-stats-monitoring?${params.toString()}`;
		const ws = new WebSocket(wsUrl);

		ws.onmessage = (e) => {
			const value = JSON.parse(e.data);
			if (!value) return;

			const nextData = {
				cpu: value.data.cpu ?? currentData.cpu,
				memory: value.data.memory ?? currentData.memory,
				block: value.data.block ?? currentData.block,
				disk: value.data.disk ?? currentData.disk,
				network: value.data.network ?? currentData.network,
			};

			setCurrentData(nextData);

			const MAX_DATA_POINTS = 300;
			setAccumulativeData((prevData) => ({
				cpu: [...prevData.cpu, nextData.cpu].slice(-MAX_DATA_POINTS),
				memory: [...prevData.memory, nextData.memory].slice(-MAX_DATA_POINTS),
				block: [...prevData.block, nextData.block].slice(-MAX_DATA_POINTS),
				network: [...prevData.network, nextData.network].slice(
					-MAX_DATA_POINTS,
				),
				disk: [...prevData.disk, nextData.disk].slice(-MAX_DATA_POINTS),
			}));
		};

		ws.onclose = (e) => {
			if (e.reason) {
				toast.error(e.reason);
			}
		};

		return () => ws.close();
	}, [appName, appType, serviceId, containerId]);

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-2 w-full">
						<span className="text-sm text-muted-foreground">
							Used: {String(currentData.cpu.value ?? "0%")}
						</span>
						<Progress
							value={Number.parseInt(
								String(currentData.cpu.value ?? "0%").replace("%", ""),
								10,
							)}
							className="w-full"
						/>
						<DockerCpuChart accumulativeData={accumulativeData.cpu} />
					</div>
				</CardContent>
			</Card>
			<Card className="bg-background">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col gap-2 w-full">
						<span className="text-sm text-muted-foreground">
							{`Used:  ${currentData.memory.value.used} / Limit: ${currentData.memory.value.total} `}
						</span>
						<Progress
							value={
								// @ts-ignore
								(convertMemoryToBytes(currentData.memory.value.used) /
									// @ts-ignore
									convertMemoryToBytes(currentData.memory.value.total)) *
								100
							}
							className="w-full"
						/>
						<DockerMemoryChart
							accumulativeData={accumulativeData.memory}
							memoryLimitGB={
								// @ts-ignore
								convertMemoryToBytes(currentData.memory.value.total) /
								1024 ** 3
							}
						/>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};
