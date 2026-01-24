import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ListSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
	items?: number;
	gridClassName?: string;
	itemClassName?: string;
	showHeader?: boolean;
	headerLines?: number;
}

const headerWidths = ["w-48", "w-64", "w-40", "w-56"];
const itemLineWidths = ["w-1/2", "w-2/3", "w-1/3"];

export function ListSkeleton({
	items = 6,
	gridClassName,
	itemClassName,
	showHeader = false,
	headerLines = 2,
	className,
	...props
}: ListSkeletonProps) {
	return (
		<div className={cn("flex flex-col gap-4", className)} {...props}>
			{showHeader && (
				<div className="space-y-2">
					{Array.from({ length: headerLines }).map((_, index) => (
						<Skeleton
							key={`list-skeleton-header-${index}`}
							className={cn("h-4", headerWidths[index % headerWidths.length])}
						/>
					))}
				</div>
			)}
			<div className={cn("grid gap-4", gridClassName)}>
				{Array.from({ length: items }).map((_, index) => (
					<div
						key={`list-skeleton-item-${index}`}
						className={cn(
							"rounded-xl border bg-card p-4 space-y-3",
							itemClassName,
						)}
					>
						<Skeleton className={cn("h-4", itemLineWidths[0])} />
						<Skeleton className={cn("h-4", itemLineWidths[1])} />
						<Skeleton className={cn("h-3", itemLineWidths[2])} />
					</div>
				))}
			</div>
		</div>
	);
}
