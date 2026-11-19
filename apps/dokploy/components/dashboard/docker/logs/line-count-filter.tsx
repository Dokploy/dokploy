import { Command as CommandPrimitive } from "cmdk";
import debounce from "lodash/debounce";
import { CheckIcon, Hash } from "lucide-react";
import React, { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const lineCountOptions = [
	{ labelKey: "docker.logs.lines100", value: 100 },
	{ labelKey: "docker.logs.lines300", value: 300 },
	{ labelKey: "docker.logs.lines500", value: 500 },
	{ labelKey: "docker.logs.lines1000", value: 1000 },
	{ labelKey: "docker.logs.lines5000", value: 5000 },
] as const;

interface LineCountFilterProps {
	value: number;
	onValueChange: (value: number) => void;
	title?: string;
}

export function LineCountFilter({
	value,
	onValueChange,
	title,
}: LineCountFilterProps) {
	const { t } = useTranslation();
	const [open, setOpen] = React.useState(false);
	const [inputValue, setInputValue] = React.useState("");
	const pendingValueRef = useRef<number | null>(null);

	const isPresetValue = lineCountOptions.some(
		(option) => option.value === value,
	);

	const debouncedValueChange = useCallback(
		debounce((numValue: number) => {
			if (numValue > 0 && numValue !== value) {
				onValueChange(numValue);
				pendingValueRef.current = null;
			}
		}, 500),
		[onValueChange, value],
	);

	const handleInputChange = (input: string) => {
		setInputValue(input);

		// Extract numbers from input and convert
		const numValue = Number.parseInt(input.replace(/[^0-9]/g, ""));
		if (!Number.isNaN(numValue)) {
			pendingValueRef.current = numValue;
			debouncedValueChange(numValue);
		}
	};

	const handleSelect = (selectedValue: string) => {
		const preset = lineCountOptions.find(
			(opt) => opt.labelKey === selectedValue,
		);
		if (preset) {
			if (preset.value !== value) {
				onValueChange(preset.value);
			}
			setInputValue("");
			setOpen(false);
			return;
		}

		const numValue = Number.parseInt(selectedValue);
		if (
			!Number.isNaN(numValue) &&
			numValue > 0 &&
			numValue !== value &&
			numValue !== pendingValueRef.current
		) {
			onValueChange(numValue);
			setInputValue("");
			setOpen(false);
		}
	};

	React.useEffect(() => {
		return () => {
			debouncedValueChange.cancel();
		};
	}, [debouncedValueChange]);

	const displayValue = isPresetValue
		? t(
				lineCountOptions.find((option) => option.value === value)?.labelKey ??
					"",
			)
		: t("docker.logs.linesCount", { amount: value });

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-9 bg-input text-sm placeholder-gray-400 w-full sm:w-auto"
				>
					{title ?? t("docker.logs.limitTo")}
					<Separator orientation="vertical" className="mx-2 h-4" />
					<div className="space-x-1 flex">
						<Badge variant="blank" className="rounded-sm px-1 font-normal">
							{displayValue}
						</Badge>
					</div>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[200px] p-0" align="start">
				<CommandPrimitive className="overflow-hidden rounded-md border border-none bg-popover text-popover-foreground">
					<div className="flex items-center border-b px-3">
						<Hash className="mr-2 h-4 w-4 shrink-0 opacity-50" />
						<CommandPrimitive.Input
							placeholder={t("docker.logs.numberOfLines")}
							value={inputValue}
							onValueChange={handleInputChange}
							className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									const numValue = Number.parseInt(
										inputValue.replace(/[^0-9]/g, ""),
									);
									if (
										!Number.isNaN(numValue) &&
										numValue > 0 &&
										numValue !== value &&
										numValue !== pendingValueRef.current
									) {
										handleSelect(inputValue);
									}
								}
							}}
						/>
					</div>
					<CommandPrimitive.List className="max-h-[300px] overflow-y-auto overflow-x-hidden">
						<CommandPrimitive.Group className="px-2 py-1.5">
							{lineCountOptions.map((option) => {
								const isSelected = value === option.value;
								return (
									<CommandPrimitive.Item
										key={option.value}
										onSelect={() => handleSelect(option.labelKey)}
										className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 aria-selected:bg-accent aria-selected:text-accent-foreground"
									>
										<div
											className={cn(
												"flex h-4 w-4 items-center justify-center rounded-sm border border-primary mr-2",
												isSelected
													? "bg-primary text-primary-foreground"
													: "opacity-50 [&_svg]:invisible",
											)}
										>
											<CheckIcon className={cn("h-4 w-4")} />
										</div>
										<span>{t(option.labelKey)}</span>
									</CommandPrimitive.Item>
								);
							})}
						</CommandPrimitive.Group>
					</CommandPrimitive.List>
				</CommandPrimitive>
			</PopoverContent>
		</Popover>
	);
}

export default LineCountFilter;
