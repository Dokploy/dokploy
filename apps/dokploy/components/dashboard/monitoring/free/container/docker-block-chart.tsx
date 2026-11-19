import { formatMb, toMb } from "@dokploy/server/monitoring/units";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
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
	accumulativeData: DockerStatsJSON["block"];
}

export const DockerBlockChart = ({ accumulativeData }: Props) => {
	const { t } = useTranslation();

	const chartConfig = {
		readMb: {
			label: t("monitoring.readMb"),
			color: "hsl(var(--chart-1))",
		},
		writeMb: {
			label: t("monitoring.writeMb"),
			color: "hsl(var(--chart-2))",
		},
	} satisfies ChartConfig;

	const transformedData = accumulativeData.map((item, index) => ({
		time: item.time,
		name: `Point ${index + 1}`,
		readMb: toMb(item.value.readMb),
		writeMb: toMb(item.value.writeMb),
	}));

	return (
		<ChartContainer config={chartConfig} className="mt-4 h-40 w-full">
			<AreaChart
				data={transformedData}
				margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
			>
				<defs>
					<linearGradient id="fillBlockRead" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="5%"
							stopColor="var(--color-readMb)"
							stopOpacity={0.8}
						/>
						<stop
							offset="95%"
							stopColor="var(--color-readMb)"
							stopOpacity={0.1}
						/>
					</linearGradient>
					<linearGradient id="fillBlockWrite" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="5%"
							stopColor="var(--color-writeMb)"
							stopOpacity={0.8}
						/>
						<stop
							offset="95%"
							stopColor="var(--color-writeMb)"
							stopOpacity={0.1}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<YAxis tickLine={false} axisLine={false} />
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							labelFormatter={(_, payload) => {
								const time = payload?.[0]?.payload?.time;
								return time ? format(new Date(time), "PPpp") : "";
							}}
							formatter={(value, name) => {
								const label =
									name === "readMb"
										? t("monitoring.read")
										: t("monitoring.write");
								return [formatMb(Number(value)), label];
							}}
						/>
					}
				/>
				<Area
					type="monotone"
					isAnimationActive={false}
					dataKey="readMb"
					stroke="var(--color-readMb)"
					fill="url(#fillBlockRead)"
					strokeWidth={2}
				/>
				<Area
					type="monotone"
					isAnimationActive={false}
					dataKey="writeMb"
					stroke="var(--color-writeMb)"
					fill="url(#fillBlockWrite)"
					strokeWidth={2}
				/>
				<ChartLegend content={<ChartLegendContent />} />
			</AreaChart>
		</ChartContainer>
	);
};
