import * as React from "react";
import { PlusIcon, TrashIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";

export interface InputArrayProps
	extends Omit<InputProps, "value" | "onChange"> {
	value?: string[] | null;
	onChange?: (value: string[]) => void;
}

const InputArray = React.forwardRef<
	HTMLInputElement,
	InputArrayProps
>(({ className, errorMessage, value, onChange, disabled, ...props }, ref) => {
    if (!value) value = [];
	const updateAt = (index: number, newValue: string) => {
		const next = [...value];
		next[index] = newValue;
		onChange?.(next);
	};

	const addItem = () => {
		onChange?.([...value, ""]);
	};

	const removeItem = (index: number) => {
		onChange?.(value.filter((_, i) => i !== index));
	};

	return (
		<>
			<div className="flex w-full flex-col gap-2">
				{value.map((item, index) => (
					<div key={index} className="flex items-center gap-2">
						<Input
							ref={index === value.length - 1 ? ref : undefined}
							value={item}
							disabled={disabled}
							className={cn("flex-1", className)}
							onChange={(e) => updateAt(index, e.target.value)}
							{...props}
						/>

						<button
							type="button"
							disabled={disabled}
							onClick={() => removeItem(index)}
							className="flex h-10 w-10 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
						>
							<TrashIcon className="h-4 w-4" />
						</button>
					</div>
				))}

				<button
					type="button"
					onClick={addItem}
					disabled={disabled}
					className="flex h-10 items-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
				>
					<PlusIcon className="h-4 w-4" />
					Add
				</button>
			</div>

			{errorMessage && (
				<span className="text-sm text-red-600 text-secondary-foreground">
					{errorMessage}
				</span>
			)}
		</>
	);
});

InputArray.displayName = "InputArray";

export { InputArray };
