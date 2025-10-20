import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/utils/api";
import { DockerBlockChart } from "./docker-block-chart";
import { DockerCpuChart } from "./docker-cpu-chart";
import { DockerDiskChart } from "./docker-disk-chart";
import { DockerMemoryChart } from "./docker-memory-chart";
import { DockerNetworkChart } from "./docker-network-chart";

const defaultData = {
	cpu: {
		value: 0,
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
}
export interface DockerStats {
	cpu: {
		value: number;
		time: string;
	};
	memory: {
		value: {
			used: number;
			total: number;
		};
		time: string;
	};
	block: {
		value: {
			readMb: number;
			writeMb: number;
		};
		time: string;
	};
	network: {
		value: {
			inputMb: number;
			outputMb: number;
		};
		time: string;
	};
	disk: {
		value: {
			diskTotal: number;
			diskUsage: number;
			diskUsedPercentage: number;
			diskFree: number;
		};

		time: string;
	};
}

export type DockerStatsJSON = {
	cpu: DockerStats["cpu"][];
	memory: DockerStats["memory"][];
	block: DockerStats["block"][];
	network: DockerStats["network"][];
	disk: DockerStats["disk"][];
};

export const convertMemoryToBytes = (
	memoryString: string | undefined,
): number => {
	if (!memoryString || typeof memoryString !== "string") {
		return 0;
	}

	const value = Number.parseFloat(memoryString) || 0;
	const unit = memoryString.replace(/[0-9.]/g, "").trim();

	switch (unit) {
		case "KiB":
			return value * 1024;
		case "MiB":
			return value * 1024 * 1024;
		case "GiB":
			return value * 1024 * 1024 * 1024;
		case "TiB":
			return value * 1024 * 1024 * 1024 * 1024;
		default:
			return value;
	}
};

export const ContainerFreeMonitoring = ({
	appName,
	appType = "application",
}: Props) => {
	const { data } = api.application.readAppMonitoring.useQuery(
		{ appName },
		{
			refetchOnWindowFocus: false,
		},
	);
	const [acummulativeData, setAcummulativeData] = useState<DockerStatsJSON>({
		cpu: [],
		memory: [],
		block: [],
		network: [],
		disk: [],
	});
	const [currentData, setCurrentData] = useState<DockerStats>(defaultData);

	useEffect(() => {
		setCurrentData(defaultData);

		setAcummulativeData({
			cpu: [],
			memory: [],
			block: [],
			network: [],
			disk: [],
		});
	}, [appName]);

	useEffect(() => {
		if (!data) return;

		setCurrentData({
			cpu: data.cpu[data.cpu.length - 1] ?? currentData.cpu,
			memory: data.memory[data.memory.length - 1] ?? currentData.memory,
			block: data.block[data.block.length - 1] ?? currentData.block,
			network: data.network[data.network.length - 1] ?? currentData.network,
			disk: data.disk[data.disk.length - 1] ?? currentData.disk,
		});
		setAcummulativeData({
			block: data?.block || [],
			cpu: data?.cpu || [],
			disk: data?.disk || [],
			memory: data?.memory || [],
			network: data?.network || [],
		});
	}, [data]);

	useEffect(() => {
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/listen-docker-stats-monitoring?appName=${appName}&appType=${appType}`;
		const ws = new WebSocket(wsUrl);

		ws.onmessage = (e) => {
			const value = JSON.parse(e.data);
			if (!value) return;

			const data = {
				cpu: value.data.cpu ?? currentData.cpu,
				memory: value.data.memory ?? currentData.memory,
				block: value.data.block ?? currentData.block,
				disk: value.data.disk ?? currentData.disk,
				network: value.data.network ?? currentData.network,
			};

			setCurrentData(data);

			setAcummulativeData((prevData) => ({
				cpu: [...prevData.cpu, data.cpu],
				memory: [...prevData.memory, data.memory],
				block: [...prevData.block, data.block],
				network: [...prevData.network, data.network],
				disk: [...prevData.disk, data.disk],
			}));
		};

		ws.onclose = (e) => {
			console.log(e.reason);
		};

		return () => ws.close();
	}, [appName]);

	return (
		<div className="rounded-xl bg-background flex flex-col gap-4">
			<header className="flex items-center justify-between">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
					<p className="text-sm text-muted-foreground">
						Watch the usage of your server in the current app
					</p>
				</div>
			</header>

			<div className="grid gap-6 lg:grid-cols-2">
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col gap-2 w-full">
							<span className="text-sm text-muted-foreground">
								Used: {currentData.cpu.value}
							</span>
							<Progress value={currentData.cpu.value} className="w-[100%]" />
							<DockerCpuChart acummulativeData={acummulativeData.cpu} />
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
								className="w-[100%]"
							/>
							<DockerMemoryChart
								acummulativeData={acummulativeData.memory}
								memoryLimitGB={
									// @ts-ignore
									convertMemoryToBytes(currentData.memory.value.total) /
									1024 ** 3
								}
							/>
						</div>
					</CardContent>
				</Card>
				{appName === "dokploy" && (
					<Card className="bg-background">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Disk Space</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex flex-col gap-2 w-full">
								<span className="text-sm text-muted-foreground">
									{`Used:  ${currentData.disk.value.diskUsage} GB / Limit: ${currentData.disk.value.diskTotal} GB`}
								</span>
								<Progress
									value={currentData.disk.value.diskUsedPercentage}
									className="w-[100%]"
								/>
								<DockerDiskChart
									acummulativeData={acummulativeData.disk}
									diskTotal={currentData.disk.value.diskTotal}
								/>
							</div>
						</CardContent>
					</Card>
				)}

				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Block I/O</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col gap-2 w-full">
							<span className="text-sm text-muted-foreground">
								{`Read:  ${currentData.block.value.readMb}  / Write: ${currentData.block.value.writeMb} `}
							</span>
							<DockerBlockChart acummulativeData={acummulativeData.block} />
						</div>
					</CardContent>
				</Card>
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Network I/O</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col gap-2 w-full">
							<span className="text-sm text-muted-foreground">
								{`In MB: ${currentData.network.value.inputMb}  / Out MB: ${currentData.network.value.outputMb} `}
							</span>
							<DockerNetworkChart acummulativeData={acummulativeData.network} />
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};
