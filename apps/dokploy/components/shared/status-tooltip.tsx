import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslation } from "next-i18next";

interface Props {
	status: "running" | "error" | "done" | "idle" | undefined | null;
	className?: string;
}

export const StatusTooltip = ({ status, className }: Props) => {
	const { t } = useTranslation("dashboard");
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
					{status === "running" && (
						<div
							className={cn("size-3.5 rounded-full bg-yellow-500", className)}
						/>
					)}
				</TooltipTrigger>
				<TooltipContent align="center">
					<span>
						{status === "idle" && t("dashboard.status.idle")}
						{status === "error" && t("dashboard.status.error")}
						{status === "done" && t("dashboard.status.done")}
						{status === "running" && t("dashboard.status.running")}
					</span>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
