import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	DEPLOYMENT_STATUSES,
	type DeploymentActivityDay,
	deploymentStatusStyles,
} from "./deployment-activity";

const chartConfig = Object.fromEntries(
	DEPLOYMENT_STATUSES.map((status) => [
		status,
		{
			label: deploymentStatusStyles[status].label,
			color: deploymentStatusStyles[status].color,
		},
	]),
) satisfies ChartConfig;

const formatDay = (date: string, pattern: string) =>
	format(parseISO(date), pattern);

const describeActivity = (days: DeploymentActivityDay[], total: number) => {
	const perStatus = DEPLOYMENT_STATUSES.map((status) => {
		const count = days.reduce((sum, day) => sum + day[status], 0);
		return `${count} ${deploymentStatusStyles[status].label.toLowerCase()}`;
	}).join(", ");
	const busiest = days.reduce((max, day) =>
		day.total > max.total ? day : max,
	);
	return `${total} deployments in the last ${days.length} days: ${perStatus}. Busiest day: ${formatDay(busiest.date, "EEEE, MMM d")} with ${busiest.total}.`;
};

export const DeploymentActivityChart = ({
	days,
	total,
}: {
	days: DeploymentActivityDay[];
	total: number;
}) => {
	return (
		<ChartContainer
			config={chartConfig}
			className="aspect-auto h-80 w-full"
			role="img"
			aria-label={describeActivity(days, total)}
		>
			<LineChart
				data={days}
				margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
			>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="date"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					tickFormatter={(date: string) => formatDay(date, "EEE d")}
				/>
				<YAxis
					allowDecimals={false}
					tickLine={false}
					axisLine={false}
					width={32}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							labelFormatter={(_, payload) => {
								const date = payload?.[0]?.payload?.date;
								return typeof date === "string"
									? formatDay(date, "EEE, MMM d")
									: null;
							}}
						/>
					}
				/>
				<ChartLegend itemSorter={null} content={<ChartLegendContent />} />
				{DEPLOYMENT_STATUSES.map((status) => (
					<Line
						key={status}
						dataKey={status}
						type="monotone"
						stroke={`var(--color-${status})`}
						strokeWidth={2}
						dot={{ r: 3, fill: `var(--color-${status})` }}
						activeDot={{ r: 5 }}
						isAnimationActive={false}
					/>
				))}
			</LineChart>
		</ChartContainer>
	);
};
