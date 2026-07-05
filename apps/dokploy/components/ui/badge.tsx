import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				secondary:
					"bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
				destructive:
					"bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
				outline:
					"border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
				ghost:
					"hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
				link: "text-primary underline-offset-4 hover:underline",
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
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant = "default",
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : "span";

	return (
		<Comp
			data-slot="badge"
			data-variant={variant}
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
