import { format } from "date-fns";
import { useTranslation } from "next-i18next";
import {
	Area,
	AreaChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	YAxis,
} from "recharts";
import type { DockerStatsJSON } from "./show-free-container-monitoring";

interface Props {
	acummulativeData: DockerStatsJSON["disk"];
	diskTotal: number;
}

export const DockerDiskChart = ({ acummulativeData, diskTotal }: Props) => {
	const { t } = useTranslation("common");
	const transformedData = acummulativeData.map((item, index) => {
		return {
			time: item.time,
			name: t("monitoring.chart.point", { index: index + 1 }),
			usedGb: +item.value.diskUsage,
			totalGb: +item.value.diskTotal,
			freeGb: item.value.diskFree,
		};
	});

	return (
		<div className="mt-6 w-full h-[10rem]">
			<ResponsiveContainer>
				<AreaChart
					data={transformedData}
					margin={{
						top: 10,
						right: 30,
						left: 0,
						bottom: 0,
					}}
				>
					<defs>
						<linearGradient id="colorUsed" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="#6C28D9" stopOpacity={0.8} />
							<stop offset="95%" stopColor="#6C28D9" stopOpacity={0} />
						</linearGradient>
						<linearGradient id="colorFree" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="#6C28D9" stopOpacity={0.2} />
							<stop offset="95%" stopColor="#6C28D9" stopOpacity={0} />
						</linearGradient>
					</defs>
					<YAxis stroke="#A1A1AA" domain={[0, diskTotal]} />
					<CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
					{/* @ts-ignore */}
					<Tooltip content={<CustomTooltip />} />
					<Legend />
					<Area
						type="monotone"
						dataKey="usedGb"
						stroke="#6C28D9"
						fillOpacity={1}
						fill="url(#colorUsed)"
						name={t("monitoring.disk.legend.usedGB")}
					/>
					<Area
						type="monotone"
						dataKey="freeGb"
						stroke="#8884d8"
						fillOpacity={1}
						fill="url(#colorFree)"
						name={t("monitoring.disk.legend.freeGB")}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
};
interface CustomTooltipProps {
	active: boolean;
	payload?: {
		color?: string;
		dataKey?: string;
		value?: number;
		payload: {
			time: string;
			usedGb: number;
			freeGb: number;
			totalGb: number;
		};
	}[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	const { t } = useTranslation("common");
	if (active && payload && payload.length && payload[0]) {
		const { time, usedGb, freeGb, totalGb } = payload[0].payload;
		return (
			<div className="custom-tooltip bg-background p-2 shadow-lg rounded-md text-primary border">
				<p>
					{t("monitoring.chart.date", {
						date: format(new Date(time), "PPpp"),
					})}
				</p>
				<p>
					{t("monitoring.disk.tooltip.usage", { value: usedGb })}
				</p>
				<p>
					{t("monitoring.disk.tooltip.free", { value: freeGb })}
				</p>
				<p>
					{t("monitoring.disk.tooltip.total", { value: totalGb })}
				</p>
			</div>
		);
	}

	return null;
};
