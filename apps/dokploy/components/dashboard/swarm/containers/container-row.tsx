import { AlertCircle, HardDrive, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ContainerInfo, ContainerStat } from "./types";
import { formatCpu, formatIOValue, formatMemUsage } from "./utils";

interface ContainerRowProps {
	container: ContainerInfo;
	stat: ContainerStat | undefined;
}

export const ContainerRow = ({ container, stat }: ContainerRowProps) => {
	const isRunning = container.CurrentState.startsWith("Running");
	const hasError = container.Error && container.Error.trim() !== "";

	const stateBadge = (
		<Badge
			variant={hasError ? "destructive" : isRunning ? "default" : "destructive"}
		>
			{container.CurrentState}
		</Badge>
	);

	return (
		<TableRow>
			<TableCell>
				<div className="flex flex-col gap-1">
					<span className="font-medium text-sm">{container.Name}</span>
					<span className="text-xs text-muted-foreground truncate max-w-[230px]">
						{container.Image}
					</span>
				</div>
			</TableCell>
			<TableCell>
				{hasError ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="inline-flex items-center gap-1.5 cursor-help">
									{stateBadge}
									<AlertCircle className="h-3.5 w-3.5 text-destructive" />
								</span>
							</TooltipTrigger>
							<TooltipContent side="top" className="max-w-xs">
								<p className="text-xs font-medium">Error:</p>
								<p className="text-xs">{container.Error}</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				) : (
					stateBadge
				)}
			</TableCell>
			<TableCell className="text-right">
				{stat ? (
					<span className="text-sm font-medium">{formatCpu(stat.CPUPerc)}</span>
				) : (
					<span className="text-xs text-muted-foreground">--</span>
				)}
			</TableCell>
			<TableCell className="text-right">
				{stat ? (
					<span className="text-sm font-medium">
						{formatMemUsage(stat.MemUsage)}
					</span>
				) : (
					<span className="text-xs text-muted-foreground">--</span>
				)}
			</TableCell>
			<TableCell className="text-right">
				{stat ? (
					<div className="flex items-center justify-end gap-1.5">
						<HardDrive className="h-3 w-3 text-muted-foreground" />
						<span className="text-sm">{formatIOValue(stat.BlockIO)}</span>
					</div>
				) : (
					<span className="text-xs text-muted-foreground">--</span>
				)}
			</TableCell>
			<TableCell className="text-right">
				{stat ? (
					<div className="flex items-center justify-end gap-1.5">
						<Network className="h-3 w-3 text-muted-foreground" />
						<span className="text-sm">{formatIOValue(stat.NetIO)}</span>
					</div>
				) : (
					<span className="text-xs text-muted-foreground">--</span>
				)}
			</TableCell>
		</TableRow>
	);
};
