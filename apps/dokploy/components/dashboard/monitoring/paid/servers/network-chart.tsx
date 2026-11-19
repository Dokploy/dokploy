import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
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

interface NetworkChartProps {
	data: any[];
}

function formatNetworkGB(valueInMB: number) {
	if (Number.isNaN(valueInMB)) return "0";
	return (valueInMB / 1024).toFixed(1);
}

export function NetworkChart({ data }: NetworkChartProps) {
	const { t } = useTranslation();

	const chartConfig = {
		networkIn: {
			label: t("monitoring.networkIn"),
			color: "hsl(var(--chart-3))",
		},
		networkOut: {
			label: t("monitoring.networkOut"),
			color: "hsl(var(--chart-4))",
		},
	} satisfies ChartConfig;
	const latestData = data[data.length - 1] || {};

	return (
		<Card className="bg-transparent">
			<CardHeader className="border-b py-5">
				<CardTitle>{t("monitoring.network")}</CardTitle>
				<CardDescription>
					{t("monitoring.networkTotalSinceBoot", {
						out: formatNetworkGB(latestData.networkOut),
						in: formatNetworkGB(latestData.networkIn),
					})}
				</CardDescription>
			</CardHeader>
			<CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
				<ChartContainer
					config={chartConfig}
					className="aspect-auto h-[250px] w-full"
				>
					<AreaChart data={data}>
						<defs>
							<linearGradient id="fillNetworkIn" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="5%"
									stopColor="hsl(var(--chart-3))"
									stopOpacity={0.8}
								/>
								<stop
									offset="95%"
									stopColor="hsl(var(--chart-3))"
									stopOpacity={0.1}
								/>
							</linearGradient>
							<linearGradient id="fillNetworkOut" x1="0" y1="0" x2="0" y2="1">
								<stop
									offset="5%"
									stopColor="hsl(var(--chart-4))"
									stopOpacity={0.8}
								/>
								<stop
									offset="95%"
									stopColor="hsl(var(--chart-4))"
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
						<YAxis tickFormatter={(value) => `${formatNetworkGB(value)} GB`} />
						<ChartTooltip
							cursor={false}
							content={({ active, payload, label }) => {
								if (active && payload && payload.length) {
									const data = payload?.[0]?.payload;
									return (
										<div className="rounded-lg border bg-background p-2 shadow-xs">
											<div className="grid grid-cols-2 gap-2">
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														{t("monitoring.time")}
													</span>
													<span className="font-bold">
														{formatTimestamp(label)}
													</span>
												</div>
												<div className="flex flex-col">
													<span className="text-[0.70rem] uppercase text-muted-foreground">
														{t("monitoring.network")}
													</span>
													<span className="font-bold">
														↑ {formatNetworkGB(data.networkOut)} GB
														<br />↓ {formatNetworkGB(data.networkIn)} GB
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
							name={t("monitoring.networkIn")}
							dataKey="networkIn"
							type="monotone"
							isAnimationActive={false}
							fill="url(#fillNetworkIn)"
							stroke="hsl(var(--chart-3))"
							strokeWidth={2}
						/>
						<Area
							name={t("monitoring.networkOut")}
							dataKey="networkOut"
							type="monotone"
							isAnimationActive={false}
							fill="url(#fillNetworkOut)"
							stroke="hsl(var(--chart-4))"
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
}
