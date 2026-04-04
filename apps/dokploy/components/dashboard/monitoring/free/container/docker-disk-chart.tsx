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
	accumulativeData: DockerStatsJSON["disk"];
	diskTotal: number;
}

const chartConfig = {
	usedGb: {
		label: "Used (GB)",
		color: "hsl(var(--chart-3))",
	},
	freeGb: {
		label: "Free (GB)",
		color: "hsl(var(--chart-4))",
	},
} satisfies ChartConfig;

export const DockerDiskChart = ({ accumulativeData, diskTotal }: Props) => {
	const transformedData = accumulativeData.map((item, index) => ({
		time: item.time,
		name: `Point ${index + 1}`,
		usedGb: +item.value.diskUsage,
		totalGb: +item.value.diskTotal,
		freeGb: item.value.diskFree,
	}));

	return (
		<ChartContainer config={chartConfig} className="mt-4 h-[10rem] w-full">
			<AreaChart
				data={transformedData}
				margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
			>
				<defs>
					<linearGradient id="fillDiskUsed" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="5%"
							stopColor="var(--color-usedGb)"
							stopOpacity={0.8}
						/>
						<stop
							offset="95%"
							stopColor="var(--color-usedGb)"
							stopOpacity={0.1}
						/>
					</linearGradient>
					<linearGradient id="fillDiskFree" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="5%"
							stopColor="var(--color-freeGb)"
							stopOpacity={0.4}
						/>
						<stop
							offset="95%"
							stopColor="var(--color-freeGb)"
							stopOpacity={0.1}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<YAxis
					domain={[0, diskTotal]}
					tickLine={false}
					axisLine={false}
					tickFormatter={(value) => `${value} GB`}
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
							formatter={(value, name) => {
								const label =
									name === "usedGb" ? "Used" : "Free";
								return [`${value} GB`, label];
							}}
						/>
					}
				/>
				<Area
					type="monotone"
					dataKey="usedGb"
					stroke="var(--color-usedGb)"
					fill="url(#fillDiskUsed)"
					strokeWidth={2}
				/>
				<Area
					type="monotone"
					dataKey="freeGb"
					stroke="var(--color-freeGb)"
					fill="url(#fillDiskFree)"
					strokeWidth={2}
				/>
				<ChartLegend content={<ChartLegendContent />} />
			</AreaChart>
		</ChartContainer>
	);
};
