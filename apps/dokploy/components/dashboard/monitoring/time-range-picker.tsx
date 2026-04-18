import { cn } from "@/lib/utils";

export const TIME_RANGES = {
	"15m": { label: "15m", dataPoints: 90 },
	"1h": { label: "1h", dataPoints: 360 },
	"6h": { label: "6h", dataPoints: 2160 },
	"24h": { label: "24h", dataPoints: 8640 },
	"7d": { label: "7d", dataPoints: 60480 },
} as const;

export type TimeRange = keyof typeof TIME_RANGES;

export const isTimeRange = (value: string): value is TimeRange =>
	value in TIME_RANGES;

interface Props {
	value: TimeRange;
	onChange: (value: TimeRange) => void;
}

export const TimeRangePicker = ({ value, onChange }: Props) => {
	return (
		<div className="inline-flex items-center gap-1 rounded-md border bg-muted p-1">
			{(Object.keys(TIME_RANGES) as TimeRange[]).map((range) => (
				<button
					key={range}
					type="button"
					onClick={() => onChange(range)}
					aria-pressed={value === range}
					className={cn(
						"rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
						value === range
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{TIME_RANGES[range].label}
				</button>
			))}
		</div>
	);
};
