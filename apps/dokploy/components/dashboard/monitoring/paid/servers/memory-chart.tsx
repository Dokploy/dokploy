import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useTranslation } from "next-i18next";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@/components/ui/chart";
import { formatTimestamp } from "@/lib/utils";

interface MemoryChartProps {
	data: any[];
}
export function MemoryChart({ data }: MemoryChartProps) {
	const { t } = useTranslation("common");
	const latestData = data[data.length - 1] || {};
	const chartConfig: ChartConfig = {
		Memory: {
			label: t("monitoring.legend.memory"),
			color: "hsl(var(--chart-2))",
		},
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="border-b py-5">
				<CardTitle>{t("monitoring.card.memory")}</CardTitle>
				<CardDescription>
					{t("monitoring.chart.memoryUsage", {
						usage: `${latestData.memUsedGB} GB / ${latestData.memTotal} GB (${latestData.memUsed}%)`,
					})}
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
								<stop
									offset="5%"
									stopColor="hsl(var(--chart-2))"
									stopOpacity={0.8}
								/>
								<stop
									offset="95%"
									stopColor="hsl(var(--chart-2))"
									stopOpacity={0.1}
								/>
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
							domain={[
								0,
								Math.ceil(Number.parseFloat(latestData.memTotal || "0")),
							]}
						/>
						<ChartTooltip
							cursor={false}
							content={({ active, payload, label }) => {
								if (active && payload && payload.length) {
									const data = payload?.[0]?.payload;
									return (
										<div className="rounded-lg border bg-background p-2 shadow-sm">
											<div className="grid grid-cols-2 gap-2">
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														{t("monitoring.tooltip.time")}
													</span>
													<span className="font-bold">
														{formatTimestamp(label)}
													</span>
												</div>
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														{t("monitoring.tooltip.memory")}
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
							dataKey="memUsed"
							type="monotone"
							fill="url(#fillMemory)"
							stroke="hsl(var(--chart-2))"
							strokeWidth={2}
							name={t("monitoring.legend.memory")}
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
