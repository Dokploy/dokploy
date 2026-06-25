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

interface Props {
	accumulativeData: DockerStatsJSON["cpu"];
}

const chartConfig = {
	usage: {
		label: "CPU Usage",
		color: "hsl(var(--chart-1))",
	},
} satisfies ChartConfig;

export const DockerCpuChart = ({ accumulativeData }: Props) => {
	const transformedData = accumulativeData.map((item, index) => ({
		name: `Point ${index + 1}`,
		time: item.time,
		usage: item.value.toString().split("%")[0],
	}));

	return (
		<ChartContainer config={chartConfig} className="mt-4 h-[10rem] w-full">
			<AreaChart
				data={transformedData}
				margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
			>
				<defs>
					<linearGradient id="fillCpu" x1="0" y1="0" x2="0" y2="1">
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
					tickFormatter={(value) => `${value}%`}
					domain={[0, 100]}
					tickLine={false}
					axisLine={false}
				/>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							labelFormatter={(_, payload) => {
								const time = payload?.[0]?.payload?.time;
								return time ? format(new Date(time), "PPpp") : "";
							}}
							formatter={(value) => [`${value}%`, "CPU Usage"]}
						/>
					}
				/>
				<Area
					type="monotone"
					dataKey="usage"
					stroke="var(--color-usage)"
					fill="url(#fillCpu)"
					strokeWidth={2}
				/>
				<ChartLegend content={<ChartLegendContent />} />
			</AreaChart>
		</ChartContainer>
	);
};
