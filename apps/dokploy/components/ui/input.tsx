import * as React from "react";
import { cn } from "~/lib/utils";

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
						"flex h-10 w-full rounded-md bg-input px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none  focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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

export { Input };
