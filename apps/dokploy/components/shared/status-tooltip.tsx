"use client";

import { useTranslations } from "next-intl";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
	const t = useTranslations("sharedStatus");

	const statusLabel =
		status === "idle"
			? t("idle")
			: status === "error"
				? t("error")
				: status === "done"
					? t("done")
					: status === "cancelled"
						? t("cancelled")
						: status === "running"
							? t("running")
							: null;

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
					<span>{statusLabel}</span>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
