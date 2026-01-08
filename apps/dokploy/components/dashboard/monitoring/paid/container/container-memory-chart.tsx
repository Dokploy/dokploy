import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
} from "@/components/ui/chart";
import { formatTimestamp } from "@/lib/utils";

interface ContainerMetric {
	timestamp: string;
	Memory: {
		percentage: number;
		used: number;
		total: number;
		usedUnit: string;
		totalUnit: string;
	};
}

interface Props {
	data: ContainerMetric[];
}

const chartConfig = {
	memory: {
		label: "Memory",
		color: "hsl(var(--chart-2))",
	},
} satisfies ChartConfig;

const formatMemoryValue = (value: number) => {
	return value.toLocaleString("en-US", {
		minimumFractionDigits: 1,
		maximumFractionDigits: 2,
	});
};

export const ContainerMemoryChart = ({ data }: Props) => {
	const formattedData = data.map((metric) => ({
		timestamp: metric.timestamp,
		memory: metric.Memory.percentage,
		usage: `${formatMemoryValue(metric.Memory.used)}${metric.Memory.usedUnit} / ${formatMemoryValue(metric.Memory.total)}${metric.Memory.totalUnit}`,
	}));

	const latestData = formattedData[formattedData.length - 1] || {
		timestamp: "",
		memory: 0,
		usage: "0 / 0 B",
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="border-b py-5">
				<CardTitle>Memory</CardTitle>
				<CardDescription>Memory Usage: {latestData.usage}</CardDescription>
			</CardHeader>
			<CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
				<ChartContainer
					config={chartConfig}
					className="aspect-auto h-[250px] w-full"
				>
					<AreaChart data={formattedData}>
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
						<YAxis tickFormatter={(value) => `${value}%`} domain={[0, 100]} />
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
														Time
													</span>
													<span className="font-bold">
														{formatTimestamp(label)}
													</span>
												</div>
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														Memory
													</span>
													<span className="font-bold">{data.memory}%</span>
												</div>
												<div className="flex flex-col col-span-2">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														Usage
													</span>
													<span className="font-bold">{data.usage}</span>
												</div>
											</div>
										</div>
									);
								}
								return null;
							}}
						/>
						<Area
							name="Memory"
							dataKey="memory"
							type="monotone"
							fill="url(#fillMemory)"
							stroke="hsl(var(--chart-2))"
							strokeWidth={2}
						/>
						<ChartLegend
							content={<ChartLegendContent />}
							verticalAlign="bottom"
							align="center"
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
};
