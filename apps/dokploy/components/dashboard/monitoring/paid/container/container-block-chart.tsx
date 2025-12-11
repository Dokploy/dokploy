import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useTranslation } from "next-i18next";
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

interface ContainerMetric {
	timestamp: string;
	BlockIO: {
		read: number;
		write: number;
		readUnit: string;
		writeUnit: string;
	};
}

interface Props {
	data: ContainerMetric[];
}
export const ContainerBlockChart = ({ data }: Props) => {
	const { t } = useTranslation("common");
	const formattedData = data.map((metric) => ({
		timestamp: metric.timestamp,
		read: metric.BlockIO.read,
		write: metric.BlockIO.write,
		readUnit: metric.BlockIO.readUnit,
		writeUnit: metric.BlockIO.writeUnit,
	}));

	const latestData = formattedData[formattedData.length - 1] || {
		timestamp: "",
		read: 0,
		write: 0,
		readUnit: "B",
		writeUnit: "B",
	};
	const chartConfig: ChartConfig = {
		read: {
			label: t("monitoring.legend.read"),
			color: "hsl(217, 91%, 60%)",
		},
		write: {
			label: t("monitoring.legend.write"),
			color: "hsl(142, 71%, 45%)",
		},
	};

	return (
		<Card className="bg-transparent">
			<CardHeader className="border-b py-5">
				<CardTitle>{t("monitoring.card.blockIO")}</CardTitle>
				<CardDescription>
					{t("monitoring.blockIO.description", {
						read: latestData.read,
						readUnit: latestData.readUnit,
						write: latestData.write,
						writeUnit: latestData.writeUnit,
					})}
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
									stopColor="hsl(217, 91%, 60%)"
									stopOpacity={0.3}
								/>
								<stop
									offset="95%"
									stopColor="hsl(217, 91%, 60%)"
									stopOpacity={0.1}
								/>
							</linearGradient>
							<linearGradient id="fillWrite" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="5%"
									stopColor="hsl(142, 71%, 45%)"
									stopOpacity={0.3}
								/>
								<stop
									offset="95%"
									stopColor="hsl(142, 71%, 45%)"
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
									const data = payload?.[0]?.payload;
									return (
										<div className="rounded-lg border bg-background p-2 shadow-sm">
											<div className="grid grid-cols-2 gap-2">
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														{t("monitoring.tooltip.time")}
													</span>
													<span className="font-bold">
														{formatTimestamp(label)}
													</span>
												</div>
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														{t("monitoring.legend.read")}
													</span>
													<span className="font-bold">
														{data.read}
														{data.readUnit}
													</span>
												</div>
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														{t("monitoring.legend.write")}
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
							name={t("monitoring.legend.write")}
							dataKey="write"
							type="monotone"
							fill="url(#fillWrite)"
							stroke="hsl(142, 71%, 45%)"
							strokeWidth={2}
							fillOpacity={0.3}
						/>
						<Area
							name={t("monitoring.legend.read")}
							dataKey="read"
							type="monotone"
							fill="url(#fillRead)"
							stroke="hsl(217, 91%, 60%)"
							strokeWidth={2}
							fillOpacity={0.3}
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
