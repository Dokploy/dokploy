import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, formatDistanceToNow } from "date-fns";

interface Props {
	date: string;
	children?: React.ReactNode;
}

export const DateTooltip = ({ date, children }: Props) => {
	return (
		<TooltipProvider delayDuration={0}>
			<Tooltip>
				<TooltipTrigger>
					<span className="flex items-center text-muted-foreground text-left">
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
