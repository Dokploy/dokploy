import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslation } from "next-i18next";

interface Props {
	status:
		| "running"
		| "error"
		| "done"
		| "idle"
		| "cancelled"
		| undefined
		| null;
	className?: string;
}

export const StatusTooltip = ({ status, className }: Props) => {
	const { t } = useTranslation("common");

	return (
		<TooltipProvider delayDuration={0}>
			<Tooltip>
				<TooltipTrigger>
					{status === "idle" && (
						<div
							className={cn(
								"size-3.5 rounded-full bg-muted-foreground dark:bg-card",
								className,
							)}
						/>
					)}
					{status === "error" && (
						<div
							className={cn("size-3.5 rounded-full bg-destructive", className)}
						/>
					)}
					{status === "done" && (
						<div
							className={cn("size-3.5 rounded-full bg-green-500", className)}
						/>
					)}
					{status === "cancelled" && (
						<div
							className={cn(
								"size-3.5 rounded-full bg-muted-foreground",
								className,
							)}
						/>
					)}
					{status === "running" && (
						<div
							className={cn("size-3.5 rounded-full bg-yellow-500", className)}
						/>
					)}
				</TooltipTrigger>
				<TooltipContent align="center">
					<span>
						{status === "idle" && t("status.idle")}
						{status === "error" && t("status.error")}
						{status === "done" && t("status.done")}
						{status === "running" && t("status.running")}
						{status === "cancelled" && t("status.cancelled")}
					</span>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
