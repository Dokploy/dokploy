import { cn } from "@/lib/utils";
import * as React from "react";

export interface InputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	errorMessage?: string;
	debounceMs?: number;
	onDebounce?: (value: string) => void;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	(
		{
			className,
			errorMessage,
			type,
			debounceMs,
			onDebounce,
			onChange,
			...props
		},
		ref,
	) => {
		React.useEffect(() => {
			if (!debounceMs || !onChange) return;

			const timer = setTimeout(() => {
				onDebounce?.(props.value?.toString() ?? "");
			}, debounceMs);

			return () => clearTimeout(timer);
		}, [props.value, debounceMs, onDebounce]);

		return (
			<>
				<input
					type={type}
					className={cn(
						"flex h-10 w-full rounded-md bg-input px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none  focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
						className,
					)}
					onChange={onChange}
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
	({ className, errorMessage, onDebounce, ...props }, ref) => {
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
				onDebounce={onDebounce}
			/>
		);
	},
);
NumberInput.displayName = "NumberInput";

export { Input, NumberInput };
