import { HardDrive } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import {
	Label,
	PolarGrid,
	PolarRadiusAxis,
	RadialBar,
	RadialBarChart,
} from "recharts";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";

interface RadialChartProps {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data: any;
}

export function DiskChart({ data }: RadialChartProps) {
	const t = useTranslations("monitoringDashboard.chartLabels");
	const chartConfig = useMemo(
		() =>
			({
				disk: {
					label: t("disk"),
					color: "hsl(var(--chart-2))",
				},
			}) satisfies ChartConfig,
		[t],
	);
	const diskUsed = Number.parseFloat(String(data.diskUsed || 0));
	const totalDiskGB = Number.parseFloat(String(data.totalDisk || 0));
	const usedDiskGB = (totalDiskGB * diskUsed) / 100;

	const chartData = [
		{
			disk: 25,
			fill: "hsl(var(--chart-2))",
		},
	];

	const endAngle = (diskUsed * 360) / 100;

	return (
		<Card className="flex flex-col bg-transparent">
			<CardHeader className="items-center border-b pb-5">
				<CardTitle>{t("disk")}</CardTitle>
				<CardDescription>{t("storageSpace")}</CardDescription>
			</CardHeader>
			<CardContent className="flex-1 pb-0">
				<ChartContainer
					config={chartConfig}
					className="mx-auto aspect-square max-h-[250px]"
				>
					<RadialBarChart
						data={chartData}
						startAngle={0}
						endAngle={endAngle}
						innerRadius={80}
						outerRadius={110}
					>
						<PolarGrid
							gridType="circle"
							radialLines={false}
							stroke="none"
							className="first:fill-muted last:fill-background"
							polarRadius={[86, 74]}
						/>
						<RadialBar
							dataKey="disk"
							background
							cornerRadius={10}
							fill="hsl(var(--chart-2))"
						/>
						<PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
							<Label
								content={({ viewBox }) => {
									if (viewBox && "cx" in viewBox && "cy" in viewBox) {
										return (
											<text
												x={viewBox.cx}
												y={viewBox.cy}
												textAnchor="middle"
												dominantBaseline="middle"
											>
												<tspan
													x={viewBox.cx}
													y={viewBox.cy}
													className="fill-foreground text-4xl font-bold"
												>
													{diskUsed.toFixed(1)}%
												</tspan>
												<tspan
													x={viewBox.cx}
													y={(viewBox.cy || 0) + 24}
													className="fill-muted-foreground text-sm"
												>
													{t("diskUsedCenter")}
												</tspan>
											</text>
										);
									}
								}}
							/>
						</PolarRadiusAxis>
					</RadialBarChart>
				</ChartContainer>
			</CardContent>
			<CardFooter className="flex-col gap-2 text-sm">
				<div className="flex items-center gap-2 font-medium leading-none">
					<HardDrive className="h-4 w-4" />{" "}
					{t("diskGbUsed", { value: usedDiskGB.toFixed(1) })}
				</div>
				<div className="leading-none text-muted-foreground">
					{t("diskGbTotal", { value: totalDiskGB.toFixed(1) })}
				</div>
			</CardFooter>
		</Card>
	);
}
