import { MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface UnitConverter {
	toValue: (raw: string | undefined) => number;
	fromValue: (value: number) => string;
	formatDisplay: (value: number) => string;
}

export const createConverter = (
	multiplier: number,
	formatDisplay: (value: number) => string,
): UnitConverter => ({
	toValue: (raw) => {
		if (!raw) return 0;
		const value = Number.parseInt(raw, 10);
		return Number.isNaN(value) ? 0 : value / multiplier;
	},
	fromValue: (value) =>
		value <= 0 ? "" : String(Math.round(value * multiplier)),
	formatDisplay,
});

interface NumberInputWithStepsProps {
	value: string | undefined;
	onChange: (value: string) => void;
	placeholder: string;
	step: number;
	converter: UnitConverter;
}

export const NumberInputWithSteps = ({
	value,
	onChange,
	placeholder,
	step,
	converter,
}: NumberInputWithStepsProps) => {
	const numericValue = converter.toValue(value);
	const displayValue = converter.formatDisplay(numericValue);

	const handleIncrement = () =>
		onChange(converter.fromValue(numericValue + step));
	const handleDecrement = () =>
		onChange(converter.fromValue(Math.max(0, numericValue - step)));

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-9 w-9 shrink-0"
					onClick={handleDecrement}
					disabled={numericValue <= 0}
				>
					<MinusIcon className="h-4 w-4" />
				</Button>
				<Input
					placeholder={placeholder}
					value={value || ""}
					onChange={(e) => onChange(e.target.value)}
					className="text-center"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-9 w-9 shrink-0"
					onClick={handleIncrement}
				>
					<PlusIcon className="h-4 w-4" />
				</Button>
			</div>
			{displayValue && (
				<span className="text-xs text-muted-foreground text-center">
					{displayValue}
				</span>
			)}
		</div>
	);
};
