import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className,
			)}
			{...props}
		/>
	);
}

function NumberInput({ className, ...props }: React.ComponentProps<"input">) {
	return (
		<Input
			type="text"
			className={cn("text-left", className)}
			{...props}
			value={props.value === undefined ? undefined : String(props.value)}
			onChange={(e) => {
				const value = e.target.value;
				if (value === "") {
					props.onChange?.(e);
				} else {
					const number = Number.parseInt(value, 10);
					if (!Number.isNaN(number)) {
						const syntheticEvent = {
							...e,
							target: {
								...e.target,
								value: number,
							},
						};
						props.onChange?.(
							syntheticEvent as unknown as React.ChangeEvent<HTMLInputElement>,
						);
					}
				}
			}}
		/>
	);
}

export { Input, NumberInput };
