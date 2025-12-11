import { format, formatDistanceToNow } from "date-fns";
import { enUS, zhCN, zhTW } from "date-fns/locale";
import { useTranslation } from "next-i18next";
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
	const { i18n } = useTranslation();

	const locale =
		i18n?.language === "zh-Hans"
			? zhCN
			: i18n?.language === "zh-Hant"
				? zhTW
				: enUS;

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
							locale,
						})}
					</span>
				</TooltipTrigger>
				<TooltipContent>
					{format(new Date(date), "PPpp", { locale })}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
