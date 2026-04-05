import * as React from "react";

import { cn } from "@/lib/utils";

const InputOTP = React.forwardRef<
	HTMLInputElement,
	Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
		value: string;
		onChange: (value: string) => void;
		maxLength: number;
	}
>(({ className, value, onChange, maxLength, ...props }, ref) => {
	const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const previousValueRef = React.useRef<string>(value);

	React.useImperativeHandle(ref, () => inputRef.current!);

	React.useEffect(() => {
		if (value !== previousValueRef.current) {
			const newLength = value.length;
			setFocusedIndex(newLength);
			previousValueRef.current = value;
		}
	}, [value]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value.replace(/\D/g, "").slice(0, maxLength);
		onChange(newValue);
	};

	const handleBoxClick = (index: number) => {
		inputRef.current?.focus();
		setFocusedIndex(index);
	};

	const slots = Array.from({ length: maxLength }, (_, i) => {
		const char = value[i] || "";
		const isActive =
			focusedIndex === i || (focusedIndex === null && i === value.length);
		const isFilled = !!char;

		return (
			<div
				key={i}
				onClick={() => handleBoxClick(i)}
				className={cn(
					"relative flex h-11 w-11 items-center justify-center rounded-lg border-2 border-input bg-background text-base font-semibold transition-all cursor-text hover:border-ring/50",
					isActive && "border-ring ring-2 ring-ring/20 ring-offset-1",
					isFilled && "border-primary/50 bg-primary/5",
					className,
				)}
			>
				<span className="text-foreground">{char}</span>
				{isActive && !char && (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
						<div className="h-5 w-0.5 animate-caret-blink bg-primary duration-1000" />
					</div>
				)}
			</div>
		);
	});

	return (
		<div className="relative">
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={handleChange}
				onFocus={() => setFocusedIndex(value.length)}
				onBlur={() => setFocusedIndex(null)}
				autoComplete="one-time-code"
				inputMode="numeric"
				pattern="[0-9]*"
				maxLength={maxLength}
				className="absolute inset-0 w-full h-full opacity-0 cursor-default"
				style={{ caretColor: "transparent" }}
				{...props}
			/>
			<div className="flex items-center gap-2">{slots}</div>
		</div>
	);
});
InputOTP.displayName = "InputOTP";

export { InputOTP };
