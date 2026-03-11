import { format } from "date-fns";
import {
	Area,
	AreaChart,
	CartesianGrid,
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
						<linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="#27272A" stopOpacity={0.8} />
							<stop offset="95%" stopColor="white" stopOpacity={0} />
						</linearGradient>
					</defs>
					<YAxis stroke="#A1A1AA" domain={[0, diskTotal]} />
					<CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
					{/* @ts-ignore */}
					<Tooltip content={<CustomTooltip />} />
					<Area
						type="monotone"
						dataKey="usedGb"
						stroke="#27272A"
						fillOpacity={1}
						fill="url(#colorDisk)"
						name="Used GB"
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
				<p>{`Total disk: ${payload[0].payload.totalGb} GB`}</p>
			</div>
		);
	}

	return null;
};
