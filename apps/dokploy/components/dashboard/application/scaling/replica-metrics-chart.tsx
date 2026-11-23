import { format } from "date-fns";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import type { RouterOutputs } from "@/utils/api";

type Series = NonNullable<
	RouterOutputs["scaling"]["metrics"]["data"]
>["series"][number];

// The app's --chart tokens fail colour-blind separation (two of them are a
// near-identical yellow and orange), so these charts use a palette checked
// against Dokploy's light and dark card surfaces. Slot N always gets colour N.
const PALETTE = [
	{ light: "#2a78d6", dark: "#3987e5" },
	{ light: "#eb6834", dark: "#d95926" },
	{ light: "#1baf7a", dark: "#199e70" },
	{ light: "#eda100", dark: "#c98500" },
	{ light: "#e87ba4", dark: "#d55181" },
] as const;

// Past this many replicas, lines stop being tellable apart; the chart shows
// the average and the spread instead of cycling colours.
const MAX_LINES = PALETTE.length;

type Metric = "cpuCores" | "memoryBytes";

interface Props {
	series: Series[];
	metric: Metric;
	refreshRateSeconds: number;
	formatValue: (value: number) => string;
	formatTick: (value: number) => string;
	// Smallest value the y-axis reaches, so near-idle replicas do not squeeze
	// the axis into repeated tick labels.
	minimumAxisMax: number;
	reference: { value: number; label: string } | null;
}

const bucketRows = (series: Series[], metric: Metric, bucketMs: number) => {
	const rows = new Map<number, Record<string, number>>();
	for (const line of series) {
		for (const point of line.points) {
			const t = Math.round(point.t / bucketMs) * bucketMs;
			const row = rows.get(t) ?? { t };
			row[`slot${line.slot}`] = point[metric];
			rows.set(t, row);
		}
	}
	return [...rows.values()].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
};

type AggregateRow = {
	t: number;
	average?: number;
	range?: [number, number];
};

const aggregateRows = (
	rows: Record<string, number>[],
	keys: string[],
): AggregateRow[] =>
	rows.map((row) => {
		const values = keys
			.map((key) => row[key])
			.filter((value): value is number => value !== undefined);
		if (values.length === 0) return { t: row.t ?? 0 };
		return {
			t: row.t ?? 0,
			average: values.reduce((sum, value) => sum + value, 0) / values.length,
			range: [Math.min(...values), Math.max(...values)],
		};
	});

export const ReplicaMetricsChart = ({
	series,
	metric,
	refreshRateSeconds,
	formatValue,
	formatTick,
	minimumAxisMax,
	reference,
}: Props) => {
	const rows = bucketRows(series, metric, refreshRateSeconds * 1000);
	const span = (rows.at(-1)?.t ?? 0) - (rows[0]?.t ?? 0);
	const timeFormat = span < 10 * 60_000 ? "HH:mm:ss" : "HH:mm";
	const individual =
		series.length <= MAX_LINES &&
		series.every((line) => line.slot >= 1 && line.slot <= MAX_LINES);
	const keys = series.map((line) => `slot${line.slot}`);
	const chartData: Record<string, unknown>[] = individual
		? rows
		: aggregateRows(rows, keys);

	const config: ChartConfig = individual
		? Object.fromEntries(
				series.map((line) => [
					`slot${line.slot}`,
					{
						label: `Replica ${line.slot}`,
						theme: PALETTE[line.slot - 1] ?? PALETTE[0],
					},
				]),
			)
		: {
				average: { label: "Average", theme: PALETTE[0] },
				range: { label: "Lowest to highest replica", theme: PALETTE[0] },
			};

	return (
		<ChartContainer config={config} className="aspect-auto h-[260px] w-full">
			<ComposedChart
				data={chartData}
				margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
			>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="t"
					type="number"
					scale="time"
					domain={["dataMin", "dataMax"]}
					tickFormatter={(value: number) => format(value, timeFormat)}
					tickLine={false}
					axisLine={false}
					minTickGap={32}
				/>
				<YAxis
					domain={[0, (dataMax: number) => Math.max(dataMax, minimumAxisMax)]}
					tickFormatter={formatTick}
					tickLine={false}
					axisLine={false}
					width={72}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							labelFormatter={(_, payload) => {
								const t = payload?.[0]?.payload?.t;
								return typeof t === "number" ? format(t, "HH:mm:ss") : "";
							}}
							formatter={(value, name, item) => (
								<div className="flex w-full items-center justify-between gap-4">
									<span className="flex items-center gap-1.5 text-muted-foreground">
										<span
											className="size-2.5 rounded-[2px]"
											style={{ backgroundColor: item.color }}
										/>
										{config[String(name)]?.label ?? name}
									</span>
									<span className="font-mono tabular-nums text-foreground">
										{Array.isArray(value)
											? `${formatValue(Number(value[0]))} – ${formatValue(Number(value[1]))}`
											: formatValue(Number(value))}
									</span>
								</div>
							)}
						/>
					}
				/>
				{reference && (
					<ReferenceLine
						y={reference.value}
						stroke="var(--muted-foreground)"
						strokeDasharray="4 4"
						label={{
							value: reference.label,
							position: "insideTopRight",
							fill: "var(--muted-foreground)",
							fontSize: 12,
						}}
					/>
				)}
				{individual ? (
					series.map((line) => (
						<Line
							key={line.slot}
							dataKey={`slot${line.slot}`}
							type="monotone"
							stroke={`var(--color-slot${line.slot})`}
							strokeWidth={2}
							strokeLinecap="round"
							strokeLinejoin="round"
							dot={false}
							connectNulls
							isAnimationActive={false}
						/>
					))
				) : (
					<>
						<Area
							dataKey="range"
							type="monotone"
							stroke="none"
							fill="var(--color-range)"
							fillOpacity={0.15}
							connectNulls
							isAnimationActive={false}
						/>
						<Line
							dataKey="average"
							type="monotone"
							stroke="var(--color-average)"
							strokeWidth={2}
							dot={false}
							connectNulls
							isAnimationActive={false}
						/>
					</>
				)}
				{(individual ? series.length > 1 : true) && (
					<ChartLegend content={<ChartLegendContent />} />
				)}
			</ComposedChart>
		</ChartContainer>
	);
};
