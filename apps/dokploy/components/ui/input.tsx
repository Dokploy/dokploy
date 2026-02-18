import { EyeIcon, EyeOffIcon, RefreshCcw } from "lucide-react";
import * as React from "react";
import { generateRandomPassword } from "@/lib/password-utils";
import { cn } from "@/lib/utils";

export interface InputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	errorMessage?: string;
	enablePasswordGenerator?: boolean;
	passwordGeneratorLength?: number;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	(
		{
			className,
			errorMessage,
			type,
			enablePasswordGenerator = false,
			passwordGeneratorLength,
			...props
		},
		ref,
	) => {
		const [showPassword, setShowPassword] = React.useState(false);
		const inputRef = React.useRef<HTMLInputElement>(null);
		const isPassword = type === "password";
		const shouldShowGenerator =
			isPassword &&
			enablePasswordGenerator !== false &&
			!props.disabled &&
			!props.readOnly;
		const inputType = isPassword ? (showPassword ? "text" : "password") : type;

		const setRefs = React.useCallback(
			(node: HTMLInputElement | null) => {
				// @ts-ignore
				inputRef.current = node;
				if (typeof ref === "function") {
					ref(node);
				} else if (ref) {
					ref.current = node;
				}
			},
			[ref],
		);

		const handleGeneratePassword = () => {
			const nextValue =
				typeof passwordGeneratorLength === "number" &&
				passwordGeneratorLength > 0
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
						className={cn(
							// bg-gray
							"flex h-10 w-full rounded-md bg-input px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:cursor-not-allowed disabled:opacity-50",
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
									className="rounded-sm p-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
									onClick={handleGeneratePassword}
									aria-label="Generate password"
									title="Generate password"
								>
									<RefreshCcw className="h-4 w-4" />
								</button>
							)}
							<button
								type="button"
								className="rounded-sm p-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
								onClick={() => setShowPassword(!showPassword)}
								aria-label={showPassword ? "Hide password" : "Show password"}
								aria-pressed={showPassword}
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
