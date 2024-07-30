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
import type { DockerStatsJSON } from "./show";

interface Props {
	acummulativeData: DockerStatsJSON["block"];
}

export const DockerBlockChart = ({ acummulativeData }: Props) => {
	const transformedData = acummulativeData.map((item, index) => {
		return {
			time: item.time,
			name: `Point ${index + 1}`,
			readMb: item.value.readMb,
			writeMb: item.value.writeMb,
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
							<stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
						</linearGradient>
						<linearGradient id="colorWrite" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
							<stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
						</linearGradient>
					</defs>
					<YAxis stroke="#A1A1AA" />
					<CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
					{/* @ts-ignore */}
					<Tooltip content={<CustomTooltip />} />
					<Legend />
					<Area
						type="monotone"
						dataKey="readMb"
						stroke="#27272A"
						fillOpacity={1}
						fill="url(#colorUv)"
						name="Read Mb"
					/>
					<Area
						type="monotone"
						dataKey="writeMb"
						stroke="#82ca9d"
						fillOpacity={1}
						fill="url(#colorWrite)"
						name="Write Mb"
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
			readMb: number;
			writeMb: number;
		};
	}[];
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
	if (active && payload && payload.length && payload[0]) {
		return (
			<div className="custom-tooltip bg-background p-2 shadow-lg rounded-md text-primary border">
				<p>{`Date: ${format(new Date(payload[0].payload.time), "PPpp")}`}</p>
				<p>{`Read ${payload[0].payload.readMb.toFixed(2)} MB`}</p>
				<p>{`Write: ${payload[0].payload.writeMb.toFixed(3)} MB`}</p>
			</div>
		);
	}

	return null;
};
