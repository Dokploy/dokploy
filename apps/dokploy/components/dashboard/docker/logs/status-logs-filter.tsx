import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";
import React from "react";

interface StatusLogsFilterProps {
	value?: string[];
	setValue?: (value: string[]) => void;
	title?: string;
	options: {
		label: string;
		value: string;
		icon?: React.ComponentType<{ className?: string }>;
	}[];
}

export function StatusLogsFilter({
	value = [],
	setValue,
	title,
	options,
}: StatusLogsFilterProps) {
	const selectedValues = new Set(value as string[]);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="h-9 bg-input text-sm placeholder-gray-400 w-full sm:w-auto">
					{title}
					<Separator orientation="vertical" className="mx-2 h-4" />
						<div className="space-x-1 flex">
							<Badge
								variant="blank"
								className="rounded-sm px-1 font-normal"
								>
									{selectedValues.size} selected
								</Badge>
						</div>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[200px] p-0" align="start">
				<Command>
					<CommandInput placeholder={title} />
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						<CommandGroup>
							{options.map((option) => {
								const isSelected = selectedValues.has(option.value);
								return (
									<CommandItem
										key={option.value}
										onSelect={() => {
											if (isSelected) {
												selectedValues.delete(option.value);
											} else {
												selectedValues.add(option.value);
											}
											const filterValues = Array.from(selectedValues);
											setValue?.(filterValues.length ? filterValues : []);
										}}
									>
										<div
											className={cn(
												"mr-2 flex h-4 w-4 items-center rounded-sm border border-primary",
												isSelected
													? "bg-primary text-primary-foreground"
													: "opacity-50 [&_svg]:invisible",
											)}
										>
											<CheckIcon className={cn("h-4 w-4")} />
										</div>
										{option.icon && (
											<option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
										)}
										<Badge variant={
											option.value === 'success' ? 'green' :
											option.value === 'error' ? 'red' :
											option.value === 'warning' ? 'orange' :
											option.value === 'info' ? 'blue' :
											option.value === 'debug' ? 'yellow' : 'blank'
										} >{option.label}</Badge>
									</CommandItem>
								);
							})}
						</CommandGroup>
						
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
