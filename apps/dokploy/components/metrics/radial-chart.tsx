"use client";

import { TrendingUp } from "lucide-react";
// import {
// 	Label,
// 	PolarGrid,
// 	PolarRadiusAxis,
// 	RadialBar,
// 	RadialBarChart,
// } from "recharts";

// import {
// 	Card,
// 	CardContent,
// 	CardDescription,
// 	CardFooter,
// 	CardHeader,
// 	CardTitle,
// } from "@/components/ui/card";
// import { type ChartConfig, ChartContainer } from "@/components/ui/chart";

const chartData = [
	{ browser: "safari", visitors: 200, fill: "var(--color-safari)" },
];

const chartConfig = {
	visitors: {
		label: "Visitors",
	},
	safari: {
		label: "Safari",
		color: "hsl(var(--chart-2))",
	},
} satisfies ChartConfig;

// export function Component() {
// 	return (
// 		<Card className="flex flex-col">
// 			<CardHeader className="items-center pb-0">
// 				<CardTitle>Radial Chart - Text</CardTitle>
// 				<CardDescription>January - June 2024</CardDescription>
// 			</CardHeader>
// 			<CardContent className="flex-1 pb-0">
// 				<ChartContainer
// 					config={chartConfig}
// 					className="mx-auto aspect-square max-h-[250px]"
// 				>
// 					<RadialBarChart
// 						data={chartData}
// 						startAngle={0}
// 						endAngle={250}
// 						innerRadius={80}
// 						outerRadius={110}
// 					>
// 						<PolarGrid
// 							gridType="circle"
// 							radialLines={false}
// 							stroke="none"
// 							className="first:fill-muted last:fill-background"
// 							polarRadius={[86, 74]}
// 						/>
// 						<RadialBar dataKey="visitors" background cornerRadius={10} />
// 						<PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
// 							<Label
// 								content={({ viewBox }) => {
// 									if (viewBox && "cx" in viewBox && "cy" in viewBox) {
// 										return (
// 											<text
// 												x={viewBox.cx}
// 												y={viewBox.cy}
// 												textAnchor="middle"
// 												dominantBaseline="middle"
// 											>
// 												<tspan
// 													x={viewBox.cx}
// 													y={viewBox.cy}
// 													className="fill-foreground text-4xl font-bold"
// 												>
// 													{chartData[0].visitors.toLocaleString()}
// 												</tspan>
// 												<tspan
// 													x={viewBox.cx}
// 													y={(viewBox.cy || 0) + 24}
// 													className="fill-muted-foreground"
// 												>
// 													Visitors
// 												</tspan>
// 											</text>
// 										);
// 									}
// 								}}
// 							/>
// 						</PolarRadiusAxis>
// 					</RadialBarChart>
// 				</ChartContainer>
// 			</CardContent>
// 			<CardFooter className="flex-col gap-2 text-sm">
// 				<div className="flex items-center gap-2 font-medium leading-none">
// 					Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
// 				</div>
// 				<div className="leading-none text-muted-foreground">
// 					Showing total visitors for the last 6 months
// 				</div>
// 			</CardFooter>
// 		</Card>
// 	);
// }

import { HardDrive } from "lucide-react";
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
	data: any;
}

export function DiskRadialChart({ data }: RadialChartProps) {
	const diskUsed = parseFloat(data.diskUsed || 0);
	const totalDiskGB = parseFloat(data.totalDisk || 0);
	const usedDiskGB = (totalDiskGB * diskUsed) / 100;

	const chartData = [
		{
			name: "Usado",
			value: diskUsed,
			fill: "hsl(var(--chart-2))",
		},
	];

	const chartConfig = {
		disk: {
			label: "Disco",
			color: "hsl(var(--chart-2))",
		},
	} satisfies ChartConfig;

	return (
		<Card className="flex flex-col bg-transparent">
			<CardHeader className="items-center border-b pb-5">
				<CardTitle>Disco</CardTitle>
				<CardDescription>Espacio de Almacenamiento</CardDescription>
			</CardHeader>
			<CardContent className="flex-1 pb-0">
				<ChartContainer
					config={chartConfig}
					className="mx-auto aspect-square max-h-[250px]"
				>
					<RadialBarChart
						data={chartData}
						startAngle={180}
						endAngle={0}
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
							dataKey="value"
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
													Usado
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
					<HardDrive className="h-4 w-4" /> {usedDiskGB.toFixed(1)} GB usados
				</div>
				<div className="leading-none text-muted-foreground">
					De {totalDiskGB.toFixed(1)} GB totales
				</div>
			</CardFooter>
		</Card>
	);
}
