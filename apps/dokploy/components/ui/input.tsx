import { EyeIcon, EyeOffIcon, RefreshCcw } from "lucide-react";
import * as React from "react";

import { generateRandomPassword } from "@/lib/password-utils";
import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
	errorMessage?: string;
	enablePasswordGenerator?: boolean;
	passwordGeneratorLength?: number;
}

function Input({
	className,
	type,
	errorMessage,
	enablePasswordGenerator = false,
	passwordGeneratorLength,
	ref,
	...props
}: InputProps) {
	const [showPassword, setShowPassword] = React.useState(false);
	const inputRef = React.useRef<HTMLInputElement | null>(null);
	const isPassword = type === "password";
	const shouldShowGenerator =
		isPassword &&
		enablePasswordGenerator !== false &&
		!props.disabled &&
		!props.readOnly;
	const inputType = isPassword ? (showPassword ? "text" : "password") : type;

	const setRefs = React.useCallback(
		(node: HTMLInputElement | null) => {
			inputRef.current = node;
			if (typeof ref === "function") {
				ref(node);
			} else if (ref && typeof ref === "object") {
				(ref as { current: HTMLInputElement | null }).current = node;
			}
		},
		[ref],
	);

	const handleGeneratePassword = () => {
		const nextValue =
			typeof passwordGeneratorLength === "number" && passwordGeneratorLength > 0
				? generateRandomPassword(Math.floor(passwordGeneratorLength))
				: generateRandomPassword();

		const input = inputRef.current;
		if (!input) {
			return;
		}

		const valueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		if (valueSetter) {
			valueSetter.call(input, nextValue);
		} else {
			input.value = nextValue;
		}

		input.dispatchEvent(new Event("input", { bubbles: true }));
	};

	return (
		<>
			<div className="relative w-full">
				<input
					type={inputType}
					data-slot="input"
					className={cn(
						"h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
						isPassword && (shouldShowGenerator ? "pr-16" : "pr-10"),
						className,
					)}
					ref={setRefs}
					{...props}
				/>
				{isPassword && (
					<div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3 text-muted-foreground">
						{shouldShowGenerator && (
							<button
								type="button"
								className="hover:text-foreground focus:outline-none"
								onClick={handleGeneratePassword}
								aria-label="Generate password"
								title="Generate password"
								tabIndex={-1}
							>
								<RefreshCcw className="h-4 w-4" />
							</button>
						)}
						<button
							type="button"
							className="hover:text-foreground focus:outline-none"
							onClick={() => setShowPassword(!showPassword)}
							tabIndex={-1}
						>
							{showPassword ? (
								<EyeOffIcon className="h-4 w-4" />
							) : (
								<EyeIcon className="h-4 w-4" />
							)}
						</button>
					</div>
				)}
			</div>
			{errorMessage && (
				<span className="text-sm text-red-600 text-secondary-foreground">
					{errorMessage}
				</span>
			)}
		</>
	);
}

function NumberInput({ className, ref, ...props }: InputProps) {
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
}

export { Input, NumberInput };
