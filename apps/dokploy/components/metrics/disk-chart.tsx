import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface DiskChartProps {
	data: any;
}

export function DiskChart({ data }: DiskChartProps) {
	const diskData = [
		{
			name: "Usado",
			value: parseFloat(data.diskUsed || 0),
			color: "hsl(var(--chart-2))",
		},
		{
			name: "Libre",
			value: 100 - parseFloat(data.diskUsed || 0),
			color: "hsl(var(--muted))",
		},
	];

	const totalDiskGB = parseFloat(data.totalDisk || 0);
	const usedDiskGB = (totalDiskGB * parseFloat(data.diskUsed || 0)) / 100;
	const freeDiskGB = totalDiskGB - usedDiskGB;

	return (
		<Card className="bg-transparent">
			<CardHeader className="border-b py-5">
				<CardTitle>Disco</CardTitle>
				<CardDescription>
					Espacio usado: {usedDiskGB.toFixed(1)} GB de {totalDiskGB.toFixed(1)} GB ({data.diskUsed}%)
				</CardDescription>
			</CardHeader>
			<CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
				<div className="h-[250px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<PieChart>
							<Pie
								data={diskData}
								cx="50%"
								cy="50%"
								innerRadius="60%"
								outerRadius="80%"
								paddingAngle={2}
								dataKey="value"
							>
								{diskData.map((entry, index) => (
									<Cell key={`cell-${index}`} fill={entry.color} />
								))}
							</Pie>
							<Tooltip
								content={({ active, payload }) => {
									if (active && payload && payload.length) {
										const data = payload[0].payload;
										return (
											<div className="rounded-lg border bg-background p-2 shadow-sm">
												<div className="grid grid-cols-2 gap-2">
													<div className="flex flex-col">
														<span className="text-[0.70rem] uppercase text-muted-foreground">
															{data.name}
														</span>
														<span className="font-bold">
															{data.name === "Usado"
																? `${usedDiskGB.toFixed(1)} GB`
																: `${freeDiskGB.toFixed(1)} GB`}
															<br />
															{data.value.toFixed(1)}%
														</span>
													</div>
												</div>
											</div>
										);
									}
									return null;
								}}
							/>
						</PieChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}
