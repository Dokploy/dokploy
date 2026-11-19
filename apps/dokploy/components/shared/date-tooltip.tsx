import { format, formatDistanceToNow } from "date-fns";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDateLocale } from "@/lib/i18n/date-locale";
import { cn } from "@/lib/utils";

interface Props {
	date: string;
	children?: React.ReactNode;
	className?: string;
}

export const DateTooltip = ({ date, children, className }: Props) => {
	const dateLocale = useDateLocale();
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
							locale: dateLocale,
						})}
					</span>
				</TooltipTrigger>
				<TooltipContent>
					{format(new Date(date), "PPpp", { locale: dateLocale })}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
