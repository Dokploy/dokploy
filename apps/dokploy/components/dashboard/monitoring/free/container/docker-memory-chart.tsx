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
import { convertMemoryToBytes } from "./show-free-container-monitoring";

interface Props {
	acummulativeData: DockerStatsJSON["memory"];
	memoryLimitGB: number;
}

export const DockerMemoryChart = ({
	acummulativeData,
	memoryLimitGB,
}: Props) => {
	const transformedData = acummulativeData.map((item, index) => {
		return {
			time: item.time,
			name: `Point ${index + 1}`,
			// @ts-ignore
			usage: (convertMemoryToBytes(item.value.used) / 1024 ** 3).toFixed(2),
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
						<linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="#27272A" stopOpacity={0.8} />
							<stop offset="95%" stopColor="white" stopOpacity={0} />
						</linearGradient>
					</defs>
					<YAxis stroke="#A1A1AA" domain={[0, +memoryLimitGB.toFixed(2)]} />
					<CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
					{/* @ts-ignore */}
					<Tooltip content={<CustomTooltip />} />
					<Legend />
					<Area
						type="monotone"
						dataKey="usage"
						stroke="#27272A"
						fillOpacity={1}
						fill="url(#colorUv)"
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
			usage: number;
		};
	}[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	if (active && payload && payload.length && payload[0] && payload[0].payload) {
		return (
			<div className="custom-tooltip bg-background p-2 shadow-lg rounded-md text-primary border">
				{payload[0].payload.time && (
					<p>{`Date: ${format(new Date(payload[0].payload.time), "PPpp")}`}</p>
				)}

				<p>{`Memory usage: ${payload[0].payload.usage} GB`}</p>
			</div>
		);
	}

	return null;
};
