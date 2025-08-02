import { format } from "date-fns";
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
	const transformedData = acummulativeData.map((item, index) => {
		return {
			time: item.time,
			name: `Point ${index + 1}`,
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
						name="Used GB"
					/>
					<Area
						type="monotone"
						dataKey="freeGb"
						stroke="#8884d8"
						fillOpacity={1}
						fill="url(#colorFree)"
						name="Free GB"
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
	if (active && payload && payload.length && payload[0]) {
		return (
			<div className="custom-tooltip bg-background p-2 shadow-lg rounded-md text-primary border">
				<p>{`Date: ${format(new Date(payload[0].payload.time), "PPpp")}`}</p>
				<p>{`Disk usage: ${payload[0].payload.usedGb} GB`}</p>
				<p>{`Disk free: ${payload[0].payload.freeGb} GB`}</p>
				<p>{`Total disk: ${payload[0].payload.totalGb} GB`}</p>
			</div>
		);
	}

	return null;
};
