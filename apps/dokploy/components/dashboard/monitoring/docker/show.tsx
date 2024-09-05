import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import i18n from "@/i18n";
import { api } from "@/utils/api";
import { useEffect, useState } from "react";
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
			free: 0,
			usedPercentage: 0,
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
			free: number;
			usedPercentage: number;
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

export const DockerMonitoring = ({
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
		<div>
			<Card className="bg-background">
				<CardHeader>
					<CardTitle className="text-xl">
						{i18n.getText("PAGE.dockerMonitoring.title")}
					</CardTitle>
					<CardDescription>
						{i18n.getText("PAGE.dockerMonitoring.description")}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex w-full gap-8 ">
						<div className=" flex-row gap-8 grid md:grid-cols-2 w-full">
							<div className="flex flex-col gap-2  w-full ">
								<span className="text-base font-medium">
									{i18n.getText("PAGE.dockerMonitoring.cpu")}
								</span>
								<span className="text-sm text-muted-foreground">
									{i18n.getText("PAGE.dockerMonitoring.cpuUsed", {
										value: currentData.cpu.value.toFixed(2),
									})}
								</span>
								<Progress value={currentData.cpu.value} className="w-[100%]" />
								<DockerCpuChart acummulativeData={acummulativeData.cpu} />
							</div>
							<div className="flex flex-col gap-2  w-full ">
								<span className="text-base font-medium">
									{i18n.getText("PAGE.dockerMonitoring.memory")}
								</span>
								<span className="text-sm text-muted-foreground">
									{i18n.getText("PAGE.dockerMonitoring.memoryUsed", {
										used: (currentData.memory.value.used / 1024).toFixed(2),
										limit: (currentData.memory.value.total / 1024).toFixed(2),
									})}
								</span>
								<Progress
									value={currentData.memory.value.usedPercentage}
									className="w-[100%]"
								/>
								<DockerMemoryChart
									acummulativeData={acummulativeData.memory}
									memoryLimitGB={currentData.memory.value.total / 1024}
								/>
							</div>
							{appName === "dokploy" && (
								<div className="flex flex-col gap-2  w-full ">
									<span className="text-base font-medium">
										{i18n.getText("PAGE.dockerMonitoring.space")}
									</span>
									<span className="text-sm text-muted-foreground">
										{i18n.getText("PAGE.dockerMonitoring.spaceUsed", {
											used: currentData.disk.value.diskUsage,
											limit: currentData.disk.value.diskTotal,
										})}
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
							)}
							<div className="flex flex-col gap-2  w-full ">
								<span className="text-base font-medium">
									{i18n.getText("PAGE.dockerMonitoring.blockIO")}
								</span>
								<span className="text-sm text-muted-foreground">
									{i18n.getText("PAGE.dockerMonitoring.blockIOUsed", {
										read: currentData.block.value.readMb.toFixed(2),
										write: currentData.block.value.writeMb.toFixed(3),
									})}
								</span>
								<DockerBlockChart acummulativeData={acummulativeData.block} />
							</div>
							<div className="flex flex-col gap-2  w-full ">
								<span className="text-base font-medium">
									{i18n.getText("PAGE.dockerMonitoring.network")}
								</span>
								<span className="text-sm text-muted-foreground">
									{i18n.getText("PAGE.dockerMonitoring.networkInOut", {
										input: currentData.network.value.inputMb.toFixed(2),
										output: currentData.network.value.outputMb.toFixed(3),
									})}
								</span>
								<DockerNetworkChart
									acummulativeData={acummulativeData.network}
								/>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};
