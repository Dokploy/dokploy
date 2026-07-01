import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Cell, Label, Pie, PieChart } from "recharts";
import { Button } from "@/components/ui/button";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import {
	getDockerDiskUsageChartClassName,
	getDockerDiskUsageControlsClassName,
	getDockerDiskUsageHeaderClassName,
	getDockerDiskUsageLegendClassName,
	getDockerDiskUsageLegendItemClassName,
	getDockerDiskUsageLegendTextClassName,
	getDockerDiskUsageSelectTriggerClassName,
	getDockerDiskUsageToggleClassName,
} from "./docker-disk-usage-layout";

const TYPE_TO_KEY: Record<string, string> = {
	Images: "images",
	Containers: "containers",
	"Local Volumes": "volumes",
	"Build Cache": "buildCache",
};

const DETAIL_LIMIT_OPTIONS = ["5", "10", "15", "all"] as const;
type DetailLimitOption = (typeof DETAIL_LIMIT_OPTIONS)[number];

const chartConfig = {
	value: {
		label: "Size",
	},
	images: {
		label: "Images",
		color: "hsl(var(--chart-1))",
	},
	containers: {
		label: "Containers",
		color: "hsl(var(--chart-2))",
	},
	volumes: {
		label: "Volumes",
		color: "hsl(var(--chart-3))",
	},
	buildCache: {
		label: "Build Cache",
		color: "hsl(var(--chart-4))",
	},
} satisfies ChartConfig;

const formatSize = (bytes: number): string => {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${bytes} B`;
};

const getChartLabel = (name: string) =>
	chartConfig[name as keyof typeof chartConfig]?.label ?? name;

const getDetailLimitInput = (value: DetailLimitOption) => {
	if (value === "all") return null;
	return Number.parseInt(value, 10) as 5 | 10 | 15;
};

const getDetailLimitLabel = (value: DetailLimitOption) =>
	value === "all" ? "All items" : `${value} items`;

const isPathLikeMeta = (label: string) =>
	label === "Full image id" ||
	label === "Docker path" ||
	label === "Mountpoint" ||
	label === "Digests";

const DetailMeta = ({
	itemName,
	detailId,
	meta,
}: {
	detailId: string;
	itemName: string;
	meta: { label: string; value: string }[];
}) => (
	<div className="mt-2 grid gap-1 text-xs text-muted-foreground">
		{meta.map((metaItem) => (
			<div
				key={`${itemName}-${detailId}-${metaItem.label}`}
				className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]"
			>
				<span className="shrink-0">{metaItem.label}</span>
				<span
					className={
						isPathLikeMeta(metaItem.label)
							? "min-w-0 break-all font-mono"
							: "min-w-0 break-words"
					}
					title={metaItem.value}
				>
					{metaItem.value}
				</span>
			</div>
		))}
	</div>
);

type DockerDiskUsageChartProps = {
	onDetailsVisibilityChange?: (showDetails: boolean) => void;
};

export const DockerDiskUsageChart = ({
	onDetailsVisibilityChange,
}: DockerDiskUsageChartProps) => {
	const [showDetails, setShowDetails] = useState(true);
	const [detailLimit, setDetailLimit] = useState<DetailLimitOption>("10");
	const { data, isLoading, refetch, isRefetching } =
		api.settings.getDockerDiskUsage.useQuery(
			{ detailLimit: getDetailLimitInput(detailLimit) },
			{
				refetchOnWindowFocus: false,
			},
		);

	useEffect(() => {
		onDetailsVisibilityChange?.(showDetails);
	}, [onDetailsVisibilityChange, showDetails]);

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
						details: item.details ?? [],
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
			<div className="flex items-center justify-center h-64">
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
			<div className={getDockerDiskUsageHeaderClassName(showDetails)}>
				<span className="whitespace-nowrap text-sm text-muted-foreground">
					Total: {formatSize(totalBytes)}
				</span>
				<div className={getDockerDiskUsageControlsClassName(showDetails)}>
					<Select
						value={detailLimit}
						onValueChange={(value) =>
							setDetailLimit(value as DetailLimitOption)
						}
					>
						<SelectTrigger
							className={getDockerDiskUsageSelectTriggerClassName(showDetails)}
							aria-label="Docker disk usage detail limit"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{DETAIL_LIMIT_OPTIONS.map((option) => (
								<SelectItem key={option} value={option}>
									{getDetailLimitLabel(option)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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
					<Button
						variant="outline"
						size="sm"
						className={getDockerDiskUsageToggleClassName(showDetails)}
						onClick={() => setShowDetails((value) => !value)}
					>
						{showDetails ? (
							<ChevronDown className="mr-2 size-4" />
						) : (
							<ChevronRight className="mr-2 size-4" />
						)}
						{showDetails ? "Hide details" : "Show details"}
					</Button>
				</div>
			</div>
			<ChartContainer
				config={chartConfig}
				className={getDockerDiskUsageChartClassName(showDetails)}
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
						stroke="hsl(var(--background))"
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
				</PieChart>
			</ChartContainer>
			<div className={getDockerDiskUsageLegendClassName(showDetails)}>
				{chartData.map((item) => (
					<div
						key={`legend-${item.name}`}
						className={getDockerDiskUsageLegendItemClassName(showDetails)}
					>
						<span
							className="size-2.5 shrink-0 rounded-sm"
							style={{ backgroundColor: item.fill }}
						/>
						<span
							className={getDockerDiskUsageLegendTextClassName(showDetails)}
						>
							{getChartLabel(item.name)} - {item.size}
						</span>
					</div>
				))}
			</div>
			{showDetails && (
				<div className="grid gap-3 xl:grid-cols-2">
					{chartData.map((item) => {
						const label = getChartLabel(item.name);
						const details = item.details;

						return (
							<div key={item.name} className="rounded-md border p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span
												className="size-2.5 rounded-sm"
												style={{ backgroundColor: item.fill }}
											/>
											<p className="text-sm font-medium">{label}</p>
										</div>
										<p className="mt-1 text-xs text-muted-foreground">
											{item.active} active / {item.totalCount} total
										</p>
									</div>
									<div className="shrink-0 text-right">
										<p className="text-sm font-medium">{item.size}</p>
										<p className="text-xs text-muted-foreground">
											{item.reclaimable} reclaimable
										</p>
									</div>
								</div>

								{details.length > 0 ? (
									<div className="mt-3 divide-y">
										{details.map((detail) => (
											<div
												key={`${item.name}-${detail.id}`}
												className="py-2 first:pt-0 last:pb-0"
											>
												<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
													<div className="min-w-0">
														<p
															className="break-words text-sm font-medium"
															title={detail.name}
														>
															{detail.name}
														</p>
														{detail.subtitle && (
															<p className="text-xs text-muted-foreground">
																{detail.subtitle}
															</p>
														)}
														<p
															className="break-all font-mono text-xs text-muted-foreground"
															title={detail.id}
														>
															{detail.id}
														</p>
													</div>
													<p className="shrink-0 text-sm font-medium">
														{detail.size}
													</p>
												</div>
												<DetailMeta
													itemName={item.name}
													detailId={detail.id}
													meta={detail.meta}
												/>
											</div>
										))}
										{item.totalCount > details.length && (
											<p className="pt-2 text-xs text-muted-foreground">
												Showing largest {details.length} of {item.totalCount}.
											</p>
										)}
									</div>
								) : (
									<p className="mt-3 text-xs text-muted-foreground">
										No detailed usage entries reported by Docker.
									</p>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};
