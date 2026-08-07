import { formatMb } from "@dokploy/server/monitoring/units";
import { FolderKanban } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";
import { DockerBlockChart } from "./docker-block-chart";
import { DockerCpuChart } from "./docker-cpu-chart";
import { DockerDiskChart } from "./docker-disk-chart";
import { DockerDiskUsageChart } from "./docker-disk-usage-chart";
import { DockerMemoryChart } from "./docker-memory-chart";
import { DockerNetworkChart } from "./docker-network-chart";

const ALL_SERVER = "all";

const defaultData = {
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
}
export interface DockerStats {
	cpu: {
		value: string;
		time: string;
	};
	memory: {
		value: {
			used: number | string;
			total: number | string;
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

const resetAccumulativeData = (): DockerStatsJSON => ({
	cpu: [],
	memory: [],
	block: [],
	network: [],
	disk: [],
});

export const ContainerFreeMonitoring = ({
	appName,
	appType = "application",
}: Props) => {
	const isServerView = appName === "dokploy";
	const [selectedProjectId, setSelectedProjectId] = useState(ALL_SERVER);
	const isProjectView = isServerView && selectedProjectId !== ALL_SERVER;

	const { data: projects } = api.project.all.useQuery(undefined, {
		enabled: isServerView,
	});

	const { data } = api.application.readAppMonitoring.useQuery(
		{ appName },
		{
			refetchOnWindowFocus: false,
			enabled: !isProjectView,
		},
	);

	const { data: projectStats } = api.project.resourceStats.useQuery(
		{ projectId: selectedProjectId },
		{
			enabled: isProjectView,
			refetchInterval: 2000,
			refetchOnWindowFocus: false,
		},
	);

	const [accumulativeData, setAccumulativeData] = useState<DockerStatsJSON>(
		resetAccumulativeData,
	);
	const [currentData, setCurrentData] = useState<DockerStats>(defaultData);
	const lastProjectSampleRef = useRef<string>("");

	const selectedProjectName =
		projects?.find((project) => project.projectId === selectedProjectId)
			?.name ?? projectStats?.projectName;

	useEffect(() => {
		setCurrentData(defaultData);
		setAccumulativeData(resetAccumulativeData());
		lastProjectSampleRef.current = "";
	}, [appName, selectedProjectId]);

	useEffect(() => {
		if (isProjectView || !data) return;

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
	}, [data, isProjectView]);

	useEffect(() => {
		if (!isProjectView || !projectStats?.aggregated) return;

		const sampleTime = projectStats.aggregated.cpu.time;
		if (lastProjectSampleRef.current === sampleTime) return;
		lastProjectSampleRef.current = sampleTime;

		const nextData: DockerStats = {
			cpu: projectStats.aggregated.cpu,
			memory: projectStats.aggregated.memory,
			block: projectStats.aggregated.block,
			network: projectStats.aggregated.network,
			disk: defaultData.disk,
		};

		setCurrentData(nextData);

		const MAX_DATA_POINTS = 300;
		setAccumulativeData((prevData) => ({
			cpu: [...prevData.cpu, nextData.cpu].slice(-MAX_DATA_POINTS),
			memory: [...prevData.memory, nextData.memory].slice(-MAX_DATA_POINTS),
			block: [...prevData.block, nextData.block].slice(-MAX_DATA_POINTS),
			network: [...prevData.network, nextData.network].slice(-MAX_DATA_POINTS),
			disk: prevData.disk,
		}));
	}, [projectStats, isProjectView]);

	useEffect(() => {
		if (isProjectView) return;

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/listen-docker-stats-monitoring?appName=${appName}&appType=${appType}`;
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
			console.log(e.reason);
		};

		return () => ws.close();
	}, [appName, appType, isProjectView]);

	const memoryUsedLabel = String(currentData.memory.value.used ?? "0");
	const memoryTotalLabel = String(currentData.memory.value.total ?? "0");
	const memoryProgress =
		(convertMemoryToBytes(memoryUsedLabel) /
			(convertMemoryToBytes(memoryTotalLabel) || 1)) *
		100;

	return (
		<div className="rounded-xl bg-background flex flex-col gap-4">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
					<p className="text-sm text-muted-foreground">
						{isProjectView
							? `Resource usage for ${selectedProjectName || "selected project"}`
							: "Watch the usage of your server in the current app"}
					</p>
				</div>
				{isServerView && (
					<div className="w-full sm:w-[260px]">
						<Select
							value={selectedProjectId}
							onValueChange={setSelectedProjectId}
						>
							<SelectTrigger>
								<div className="flex items-center gap-2 truncate">
									<FolderKanban className="size-4 shrink-0 text-muted-foreground" />
									<SelectValue placeholder="Filter by project" />
								</div>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectLabel>Scope</SelectLabel>
									<SelectItem value={ALL_SERVER}>All Server</SelectItem>
									{projects?.map((project) => (
										<SelectItem
											key={project.projectId}
											value={project.projectId}
										>
											{project.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				)}
			</header>

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
								value={Math.min(
									Number.parseFloat(
										String(currentData.cpu.value ?? "0%").replace("%", ""),
									) || 0,
									100,
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
								{`Used:  ${memoryUsedLabel} / Limit: ${memoryTotalLabel} `}
							</span>
							<Progress value={memoryProgress} className="w-full" />
							<DockerMemoryChart
								accumulativeData={accumulativeData.memory}
								memoryLimitGB={
									convertMemoryToBytes(memoryTotalLabel) / 1024 ** 3
								}
							/>
						</div>
					</CardContent>
				</Card>
				{!isProjectView && appName === "dokploy" && (
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
									className="w-full"
								/>
								<DockerDiskChart
									accumulativeData={accumulativeData.disk}
									diskTotal={currentData.disk.value.diskTotal}
								/>
							</div>
						</CardContent>
					</Card>
				)}
				{!isProjectView && appName === "dokploy" && (
					<Card className="bg-background">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">
								Docker Disk Usage
							</CardTitle>
						</CardHeader>
						<CardContent>
							<DockerDiskUsageChart />
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
								{`Read: ${formatMb(currentData.block.value.readMb)} / Write: ${formatMb(currentData.block.value.writeMb)}`}
							</span>
							<DockerBlockChart accumulativeData={accumulativeData.block} />
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
								{`In: ${formatMb(currentData.network.value.inputMb)} / Out: ${formatMb(currentData.network.value.outputMb)}`}
							</span>
							<DockerNetworkChart accumulativeData={accumulativeData.network} />
						</div>
					</CardContent>
				</Card>
			</div>

			{isProjectView && (
				<Card className="bg-background">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<div className="space-y-1">
							<CardTitle className="text-sm font-medium">
								Services breakdown
							</CardTitle>
							<p className="text-xs text-muted-foreground">
								Live CPU and memory usage by service in this project
							</p>
						</div>
					</CardHeader>
					<CardContent>
						{!projectStats?.services?.length ? (
							<p className="text-sm text-muted-foreground py-6 text-center">
								No services found in this project.
							</p>
						) : (
							<div className="rounded-md border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Service</TableHead>
											<TableHead>Type</TableHead>
											<TableHead>Containers</TableHead>
											<TableHead>CPU</TableHead>
											<TableHead>Memory</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{projectStats.services.map((service) => (
											<TableRow key={service.id}>
												<TableCell className="font-medium">
													{service.name}
												</TableCell>
												<TableCell>
													<Badge variant="outline" className="capitalize">
														{service.type}
													</Badge>
												</TableCell>
												<TableCell>{service.containerCount}</TableCell>
												<TableCell>{service.cpuPerc.toFixed(2)}%</TableCell>
												<TableCell>
													{service.memUsed}
													{service.containerCount > 0
														? ` / ${service.memLimit}`
														: ""}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
};
