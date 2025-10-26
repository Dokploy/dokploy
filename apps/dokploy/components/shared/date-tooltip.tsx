import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
	date?: string | number | Date;
	children?: React.ReactNode;
	className?: string;
}

export const DateTooltip = ({ date, children, className }: Props) => {
	const parsedDate = (() => {
		if (!date) return null;
		if (date instanceof Date) return date;
		if (typeof date === "number") return new Date(date);
		try {
			const iso = parseISO(date as string);
			if (isValid(iso)) return iso;
		} catch {}
		const fallback = new Date(date as string);
		return isValid(fallback) ? fallback : null;
	})();

	const hasValidDate = parsedDate && isValid(parsedDate);

	return (
		<TooltipProvider delayDuration={0}>
			<Tooltip>
				<TooltipTrigger>
					<span
						className={cn(
							"flex items-center text-muted-foreground text-left",
							className,
						)}
					>
						{children}{" "}
						{hasValidDate ? formatDistanceToNow(parsedDate as Date, { addSuffix: true }) : "-"}
					</span>
				</TooltipTrigger>
				<TooltipContent>
					{hasValidDate ? format(parsedDate as Date, "PPpp") : "Invalid date"}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
