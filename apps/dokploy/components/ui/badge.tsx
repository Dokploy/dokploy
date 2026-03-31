import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
				secondary:
					"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
				red: "rounded-md h-5 px-1.5 py-0 text-xs font-medium border-transparent select-none bg-red-600/15 text-red-600 dark:bg-red-500/15 dark:text-red-400",
				yellow:
					"rounded-md h-5 px-1.5 py-0 text-xs font-medium border-transparent select-none bg-yellow-600/15 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400",
				orange:
					"rounded-md h-5 px-1.5 py-0 text-xs font-medium border-transparent select-none bg-orange-600/15 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
				green:
					"rounded-md h-5 px-1.5 py-0 text-xs font-medium border-transparent select-none bg-emerald-600/15 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
				blue: "rounded-md h-5 px-1.5 py-0 text-xs font-medium border-transparent select-none bg-blue-600/15 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
				blank:
					"rounded-md h-5 px-1.5 py-0 text-xs font-medium border-transparent select-none bg-muted text-muted-foreground",
				outline: "text-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export interface BadgeProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return (
		<div className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

export { Badge, badgeVariants };
