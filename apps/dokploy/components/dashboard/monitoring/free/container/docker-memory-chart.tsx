import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import type { DockerStatsJSON } from "./show-free-container-monitoring";
import { convertMemoryToBytes } from "./show-free-container-monitoring";

interface Props {
	accumulativeData: DockerStatsJSON["memory"];
	memoryLimitGB: number;
}

const chartConfig = {
	usage: {
		label: "Memory (GB)",
		color: "hsl(var(--chart-2))",
	},
} satisfies ChartConfig;

export const DockerMemoryChart = ({
	accumulativeData,
	memoryLimitGB,
}: Props) => {
	const transformedData = accumulativeData.map((item, index) => ({
		time: item.time,
		name: `Point ${index + 1}`,
		// @ts-ignore
		usage: (convertMemoryToBytes(item.value.used) / 1024 ** 3).toFixed(2),
	}));

	return (
		<ChartContainer config={chartConfig} className="mt-4 h-[10rem] w-full">
			<AreaChart
				data={transformedData}
				margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
			>
				<defs>
					<linearGradient id="fillMemory" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="5%"
							stopColor="var(--color-usage)"
							stopOpacity={0.8}
						/>
						<stop
							offset="95%"
							stopColor="var(--color-usage)"
							stopOpacity={0.1}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<YAxis
					tickFormatter={(value) => `${value} GB`}
					domain={[0, +memoryLimitGB.toFixed(2)]}
					tickLine={false}
					axisLine={false}
				/>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							labelFormatter={(_, payload) => {
								const time = payload?.[0]?.payload?.time;
								return time
									? format(new Date(time), "PPpp")
									: "";
							}}
							formatter={(value) => [`${value} GB`, "Memory"]}
						/>
					}
				/>
				<Area
					type="monotone"
					dataKey="usage"
					stroke="var(--color-usage)"
					fill="url(#fillMemory)"
					strokeWidth={2}
				/>
				<ChartLegend content={<ChartLegendContent />} />
			</AreaChart>
		</ChartContainer>
	);
};
