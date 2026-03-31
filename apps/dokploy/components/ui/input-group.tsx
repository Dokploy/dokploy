"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const InputGroupContext = React.createContext<{ size: "xs" | "sm" }>({
	size: "xs",
});

interface InputGroupProps extends React.ComponentProps<"div"> {
	size?: "xs" | "sm";
}

function InputGroup({ className, size = "xs", ...props }: InputGroupProps) {
	const sizeClasses = {
		xs: "h-8 rounded-lg",
		sm: "h-10 rounded-xl",
	};

	return (
		<InputGroupContext.Provider value={{ size }}>
			<div
				data-slot="input-group"
				role="group"
				className={cn(
					"group/input-group group border-transparent bg-input relative flex w-full items-center border transition-[color,box-shadow] outline-none",
					"min-w-0",
					"has-[>[data-align=inline-start]]:[&>input]:pl-2",
					"has-[>[data-align=inline-end]]:[&>input]:pr-2",
					"has-[[data-slot=input-group-control]:focus-visible]:border-foreground/50",
					sizeClasses[size],
					className,
				)}
				{...props}
			/>
		</InputGroupContext.Provider>
	);
}

const inputGroupAddonVariants = cva(
	"text-muted-foreground flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4",
	{
		variants: {
			align: {
				"inline-start": "order-first pl-2.5",
				"inline-end": "order-last pr-2.5",
			},
		},
		defaultVariants: {
			align: "inline-start",
		},
	},
);

function InputGroupAddon({
	className,
	align = "inline-start",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
	return (
		<div
			role="group"
			data-slot="input-group-addon"
			data-align={align}
			tabIndex={-1}
			className={cn(inputGroupAddonVariants({ align }), className)}
			onClick={(e) => {
				if ((e.target as HTMLElement).closest("button")) {
					return;
				}
				e.currentTarget.parentElement?.querySelector("input")?.focus();
			}}
			{...props}
		/>
	);
}

interface InputGroupInputProps extends React.ComponentProps<typeof Input> {}

function InputGroupInput({ className, ...props }: InputGroupInputProps) {
	return (
		<Input
			data-slot="input-group-control"
			className={cn(
				"flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0",
				className,
			)}
			{...props}
		/>
	);
}

export { InputGroup, InputGroupAddon, InputGroupInput };
