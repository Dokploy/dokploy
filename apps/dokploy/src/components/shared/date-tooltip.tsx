import { format, formatDistanceToNow } from "date-fns";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
	date: string;
	children?: React.ReactNode;
	className?: string;
}

export const DateTooltip = ({ date, children, className }: Props) => {
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
						{formatDistanceToNow(new Date(date), {
							addSuffix: true,
						})}
					</span>
				</TooltipTrigger>
				<TooltipContent>{format(new Date(date), "PPpp")}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
