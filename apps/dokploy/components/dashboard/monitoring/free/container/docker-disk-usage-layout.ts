import { cn } from "@/lib/utils";

export const getDockerDiskUsageCardClassName = (showDetails: boolean) =>
	cn("bg-background", showDetails && "lg:col-span-2");

export const getDockerDiskUsageHeaderClassName = (showDetails: boolean) =>
	cn(
		showDetails
			? "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
			: "grid gap-3",
	);

export const getDockerDiskUsageControlsClassName = (showDetails: boolean) =>
	cn(
		showDetails
			? "flex flex-wrap items-center gap-2"
			: "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2",
	);

export const getDockerDiskUsageSelectTriggerClassName = (
	showDetails: boolean,
) => cn("h-8", showDetails ? "w-[116px]" : "w-full");

export const getDockerDiskUsageToggleClassName = (showDetails: boolean) =>
	cn("justify-center", showDetails ? "shrink-0" : "col-span-2 w-full");

export const getDockerDiskUsageChartClassName = (showDetails: boolean) =>
	cn(
		"mx-auto w-full aspect-auto overflow-hidden [&_.recharts-pie-label-text]:fill-foreground",
		showDetails ? "h-[220px] max-h-[220px]" : "h-[180px] max-h-[190px]",
	);

export const getDockerDiskUsageLegendClassName = (showDetails: boolean) =>
	cn(
		"text-xs text-muted-foreground",
		showDetails
			? "mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
			: "grid grid-cols-2 gap-x-3 gap-y-2",
	);

export const getDockerDiskUsageLegendItemClassName = (showDetails: boolean) =>
	cn(
		"flex min-w-0 items-center gap-2",
		showDetails ? "justify-center" : "justify-start",
	);

export const getDockerDiskUsageLegendTextClassName = (showDetails: boolean) =>
	cn("min-w-0", showDetails ? "truncate" : "break-words");
