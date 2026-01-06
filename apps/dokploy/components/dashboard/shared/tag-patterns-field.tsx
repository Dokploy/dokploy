import { HelpCircle, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@/components/ui/command";
import {
	FormControl,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface TagPatternsFieldProps {
	value: string[] | undefined;
	onChange: (value: string[]) => void;
	tags: { name: string }[] | undefined;
	isLoadingTags: boolean;
}

export const TagPatternsField = ({
	value,
	onChange,
	tags,
	isLoadingTags,
}: TagPatternsFieldProps) => {
	const [open, setOpen] = useState(false);
	const [inputValue, setInputValue] = useState("");

	const selectedValues = value || [];
	const availableTags = tags?.map((t) => t.name) || [];

	const handleSelect = (tagValue: string) => {
		if (!selectedValues.includes(tagValue)) {
			onChange([...selectedValues, tagValue]);
		}
		setInputValue("");
	};

	const handleRemove = (tagValue: string) => {
		onChange(selectedValues.filter((v) => v !== tagValue));
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && inputValue.trim()) {
			e.preventDefault();
			handleSelect(inputValue.trim());
		}
	};

	return (
		<FormItem className="md:col-span-2">
			<div className="flex items-center gap-2">
				<FormLabel>Tag Patterns</FormLabel>
				<TooltipProvider delayDuration={0}>
					<Tooltip>
						<TooltipTrigger type="button">
							<HelpCircle className="size-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
						</TooltipTrigger>
						<TooltipContent className="max-w-xs">
							<p>
								Select existing tags or type glob patterns (e.g., v*, release-*,
								v[0-9].*). Leave empty to deploy on any tag.
							</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<FormControl>
						<div className="flex min-h-10 w-full flex-wrap gap-1 rounded-md border border-input bg-input px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-pointer">
							{selectedValues.length > 0 ? (
								selectedValues.map((tagValue) => (
									<Badge
										key={tagValue}
										variant="secondary"
										className="flex items-center gap-1"
									>
										{tagValue}
										<X
											className="size-3 cursor-pointer hover:text-destructive"
											onClick={(e) => {
												e.stopPropagation();
												handleRemove(tagValue);
											}}
										/>
									</Badge>
								))
							) : (
								<span className="text-muted-foreground">
									{isLoadingTags
										? "Loading tags..."
										: "Select tags or type patterns (empty = any tag)"}
								</span>
							)}
						</div>
					</FormControl>
				</PopoverTrigger>
				<PopoverContent className="w-[400px] p-0" align="start">
					<Command>
						<CommandInput
							placeholder="Search tags or type a pattern..."
							value={inputValue}
							onValueChange={setInputValue}
							onKeyDown={handleKeyDown}
						/>
						<CommandEmpty>
							{inputValue ? (
								<button
									type="button"
									className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent"
									onClick={() => handleSelect(inputValue)}
								>
									Add pattern: "{inputValue}"
								</button>
							) : (
								"No tags found. Type a pattern and press Enter."
							)}
						</CommandEmpty>
						<ScrollArea className="h-64">
							<CommandGroup>
								{availableTags
									.filter((tag) => !selectedValues.includes(tag))
									.map((tag) => (
										<CommandItem
											key={tag}
											value={tag}
											onSelect={() => handleSelect(tag)}
										>
											{tag}
										</CommandItem>
									))}
							</CommandGroup>
						</ScrollArea>
					</Command>
				</PopoverContent>
			</Popover>

			{selectedValues.length === 0 && (
				<p className="text-xs text-muted-foreground">
					No patterns configured - will deploy on any tag
				</p>
			)}
			<FormMessage />
		</FormItem>
	);
};
