import React from "react";
import {
	Pie,
	PieChart,
	Cell,
	Tooltip,
	Legend,
	ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DiskSpacePieProps {
	/** Used disk space in GB */
	usedGB: number;
	/** Total disk space in GB */
	totalGB: number;
	/** Optional card title */
	title?: string;
}

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--muted))"];

export const DiskSpacePie: React.FC<DiskSpacePieProps> = ({
	usedGB,
	totalGB,
	title = "Disk Space Distribution",
}) => {
	const safeTotal = Number.isFinite(totalGB) && totalGB > 0 ? totalGB : 0;
	const safeUsed =
		Number.isFinite(usedGB) && usedGB > 0 ? Math.min(usedGB, safeTotal) : 0;
	const freeGB = Math.max(safeTotal - safeUsed, 0);

	const data = [
		{ name: "Used", value: Number(safeUsed.toFixed(2)) },
		{ name: "Free", value: Number(freeGB.toFixed(2)) },
	];

	return (
		<Card className="bg-transparent">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="w-full h-64">
					<ResponsiveContainer width="100%" height="100%">
						<PieChart>
							<Pie
								data={data}
								dataKey="value"
								nameKey="name"
								innerRadius={60}
								outerRadius={90}
								paddingAngle={2}
								stroke="transparent"
							>
								{data.map((entry, index) => (
									<Cell
										key={`cell-${index}`}
										fill={COLORS[index % COLORS.length]}
									/>
								))}
							</Pie>
							<Tooltip formatter={(value) => `${value} GB`} />
							<Legend verticalAlign="bottom" height={24} />
						</PieChart>
					</ResponsiveContainer>
				</div>
				<div className="mt-2 text-sm text-muted-foreground">
					{`Used: ${safeUsed.toFixed(2)} GB • Free: ${freeGB.toFixed(2)} GB • Total: ${safeTotal.toFixed(2)} GB`}
				</div>
			</CardContent>
		</Card>
	);
};

export default DiskSpacePie;

