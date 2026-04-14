import { Loader2, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { Cell, Label, Pie, PieChart } from "recharts";
import { Button } from "@/components/ui/button";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { api } from "@/utils/api";

const TYPE_TO_KEY: Record<string, string> = {
	Images: "images",
	Containers: "containers",
	"Local Volumes": "volumes",
	"Build Cache": "buildCache",
};

const chartConfig = {
	value: {
		label: "Size",
	},
	images: {
		label: "Images",
		color: "oklch(var(--chart-1))",
	},
	containers: {
		label: "Containers",
		color: "oklch(var(--chart-2))",
	},
	volumes: {
		label: "Volumes",
		color: "oklch(var(--chart-3))",
	},
	buildCache: {
		label: "Build Cache",
		color: "oklch(var(--chart-4))",
	},
} satisfies ChartConfig;

const formatSize = (bytes: number): string => {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${bytes} B`;
};

export const DockerDiskUsageChart = () => {
	const { data, isLoading, refetch, isRefetching } =
		api.settings.getDockerDiskUsage.useQuery(undefined, {
			refetchOnWindowFocus: false,
		});

	const { chartData, totalBytes } = useMemo(() => {
		const items =
			data
				?.filter((item) => item.sizeBytes > 0)
				.map((item) => {
					const key = TYPE_TO_KEY[item.type] ?? item.type;
					return {
						name: key,
						value: item.sizeBytes,
						size: item.size,
						active: item.active,
						totalCount: item.totalCount,
						reclaimable: item.reclaimable,
						fill: `var(--color-${key})`,
					};
				}) ?? [];
		return {
			chartData: items,
			totalBytes: items.reduce((sum, item) => sum + item.value, 0),
		};
	}, [data]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-[16rem]">
				<Loader2 className="size-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (chartData.length === 0) {
		return (
			<p className="text-xs text-muted-foreground mt-4">
				No Docker disk usage data available.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2 w-full">
			<div className="flex items-center justify-between">
				<span className="text-sm text-muted-foreground">
					Total: {formatSize(totalBytes)}
				</span>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					onClick={() => refetch()}
					disabled={isRefetching}
				>
					<RefreshCw
						className={`size-3.5 ${isRefetching ? "animate-spin" : ""}`}
					/>
				</Button>
			</div>
			<ChartContainer
				config={chartConfig}
				className="mx-auto w-full max-h-[250px] [&_.recharts-pie-label-text]:fill-foreground"
			>
				<PieChart>
					<ChartTooltip
						content={
							<ChartTooltipContent
								nameKey="name"
								formatter={(value, name) => {
									const item = chartData.find((d) => d.name === name);
									if (!item) return [formatSize(value as number), name];
									return [
										`${item.size} — ${item.active} active / ${item.totalCount} total — Reclaimable: ${item.reclaimable}`,
										chartConfig[name as keyof typeof chartConfig]?.label ??
											name,
									];
								}}
							/>
						}
					/>
					<Pie
						data={chartData}
						dataKey="value"
						nameKey="name"
						innerRadius={60}
						outerRadius={85}
						strokeWidth={3}
						stroke="oklch(var(--background))"
						minAngle={15}
					>
						{chartData.map((entry) => (
							<Cell key={entry.name} fill={entry.fill} />
						))}
						<Label
							content={({ viewBox }) => {
								if (viewBox && "cx" in viewBox && "cy" in viewBox) {
									return (
										<text
											x={viewBox.cx}
											y={viewBox.cy}
											textAnchor="middle"
											dominantBaseline="middle"
										>
											<tspan
												x={viewBox.cx}
												y={(viewBox.cy || 0) - 8}
												className="fill-foreground text-2xl font-bold"
											>
												{formatSize(totalBytes)}
											</tspan>
											<tspan
												x={viewBox.cx}
												y={(viewBox.cy || 0) + 14}
												className="fill-muted-foreground text-xs"
											>
												Docker Usage
											</tspan>
										</text>
									);
								}
							}}
						/>
					</Pie>
					<ChartLegend content={<ChartLegendContent nameKey="name" />} />
				</PieChart>
			</ChartContainer>
		</div>
	);
};
