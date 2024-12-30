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
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

interface ContainerMetric {
	timestamp: string;
	BlockIO: string;
}

interface Props {
	data: ContainerMetric[];
}

const chartConfig = {
	read: {
		label: "Read",
		color: "hsl(var(--chart-5))",
	},
	write: {
		label: "Write",
		color: "hsl(var(--chart-6))",
	},
} satisfies ChartConfig;

const parseBlockIO = (blockIO: string) => {
	const [read, write] = blockIO.split(" / ");
	return {
		read: Number.parseFloat(read),
		write: parseFloat(write),
		readUnit: read?.replace(/[\d.]/g, ""),
		writeUnit: write?.replace(/[\d.]/g, ""),
	};
};

export const ContainerBlockChart = ({ data }: Props) => {
	const formattedData = data.map((metric) => {
		const { read, write, readUnit, writeUnit } = parseBlockIO(metric.BlockIO);
		return {
			timestamp: metric.timestamp,
			read,
			write,
			readUnit,
			writeUnit,
		};
	});

	const latestData = formattedData[formattedData.length - 1] || {};

	return (
		<Card className="bg-transparent">
			<CardHeader className="border-b py-5">
				<CardTitle>Block I/O</CardTitle>
				<CardDescription>
					Read: {latestData.read}
					{latestData.readUnit} / Write: {latestData.write}
					{latestData.writeUnit}
				</CardDescription>
			</CardHeader>
			<CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
				<ChartContainer
					config={chartConfig}
					className="aspect-auto h-[250px] w-full"
				>
					<AreaChart data={formattedData}>
						<defs>
							<linearGradient id="fillRead" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="5%"
									stopColor="hsl(var(--chart-5))"
									stopOpacity={0.8}
								/>
								<stop
									offset="95%"
									stopColor="hsl(var(--chart-5))"
									stopOpacity={0.1}
								/>
							</linearGradient>
							<linearGradient id="fillWrite" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="5%"
									stopColor="hsl(var(--chart-6))"
									stopOpacity={0.8}
								/>
								<stop
									offset="95%"
									stopColor="hsl(var(--chart-6))"
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
						<YAxis />
						<ChartTooltip
							cursor={false}
							content={({ active, payload, label }) => {
								if (active && payload && payload.length) {
									const data = payload[0].payload;
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
														Read
													</span>
													<span className="font-bold">
														{data.read}
														{data.readUnit}
													</span>
												</div>
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														Write
													</span>
													<span className="font-bold">
														{data.write}
														{data.writeUnit}
													</span>
												</div>
											</div>
										</div>
									);
								}
								return null;
							}}
						/>
						<Area
							name="Read"
							dataKey="read"
							type="monotone"
							fill="url(#fillRead)"
							stroke="hsl(var(--chart-5))"
							strokeWidth={2}
						/>
						<Area
							name="Write"
							dataKey="write"
							type="monotone"
							fill="url(#fillWrite)"
							stroke="hsl(var(--chart-6))"
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
