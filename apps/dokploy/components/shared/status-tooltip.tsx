import type {
	ApplicationStatus,
	DeploymentStatus,
} from "@dokploy/server/db/schema";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
	status: ApplicationStatus | DeploymentStatus | null | undefined;
	className?: string;
}

export const statusColors: Record<
	ApplicationStatus | DeploymentStatus,
	string
> = {
	queued: "bg-blue-500",
	running: "bg-yellow-500",
	done: "bg-green-500",
	error: "bg-destructive",
	idle: "bg-muted-foreground dark:bg-card",
	cancelled: "bg-muted-foreground",
};

export const StatusTooltip = ({ status, className }: Props) => (
	<TooltipProvider delayDuration={0}>
		<Tooltip>
			<TooltipTrigger>
				{status && (
					<div
						className={cn(
							"size-3.5 rounded-full",
							statusColors[status],
							className,
						)}
					/>
				)}
			</TooltipTrigger>
			<TooltipContent align="center">
				<span className="capitalize">{status}</span>
			</TooltipContent>
		</Tooltip>
	</TooltipProvider>
);
