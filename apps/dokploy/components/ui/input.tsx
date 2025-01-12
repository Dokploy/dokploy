import { cn } from "@/lib/utils";
import * as React from "react";

export interface InputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	errorMessage?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, errorMessage, type, ...props }, ref) => {
		return (
			<>
				<input
					type={type}
					className={cn(
						// bg-gray
						"flex h-10 w-full rounded-md bg-input px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
					ref={ref}
					{...props}
				/>
				{errorMessage && (
					<span className="text-sm text-red-600 text-secondary-foreground">
						{errorMessage}
					</span>
				)}
			</>
		);
	},
);
Input.displayName = "Input";

const NumberInput = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, errorMessage, ...props }, ref) => {
		return (
			<Input
				type="text"
				className={cn("text-left", className)}
				ref={ref}
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
	},
);
NumberInput.displayName = "NumberInput";

export { Input, NumberInput };
