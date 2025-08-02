import { type VariantProps, cva } from "class-variance-authority";
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
				red: "border-transparent select-none items-center whitespace-nowrap font-medium bg-red-600/20 dark:bg-red-500/15 text-destructive text-xs h-4 px-1 py-1 rounded-md",
				yellow:
					"border-transparent select-none items-center whitespace-nowrap font-medium bg-yellow-600/20 dark:bg-yellow-500/15 dark:text-yellow-500 text-yellow-600 text-xs h-4 px-1 py-1 rounded-md",
				orange:
					"border-transparent select-none items-center whitespace-nowrap font-medium bg-orange-600/20 dark:bg-orange-500/15 dark:text-orange-500 text-orange-600 text-xs h-4 px-1 py-1 rounded-md",
				green:
					"border-transparent select-none items-center whitespace-nowrap font-medium bg-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-500 text-emerald-600 text-xs h-4 px-1 py-1 rounded-md",
				blue: "border-transparent select-none items-center whitespace-nowrap font-medium bg-blue-600/20 dark:bg-blue-500/15 dark:text-blue-500 text-blue-600 text-xs h-4 px-1 py-1 rounded-md",
				blank:
					"border-transparent select-none items-center whitespace-nowrap font-medium dark:bg-white/15 bg-black/15 text-foreground text-xs h-4 px-1 py-1 rounded-md",
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
