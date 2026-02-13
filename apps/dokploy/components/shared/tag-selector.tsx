import { Check, ChevronsUpDown, X } from "lucide-react";
import * as React from "react";
import { HandleTag } from "@/components/dashboard/settings/tags/tag-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";

export interface Tag {
	id: string;
	name: string;
	color?: string;
}

interface TagSelectorProps {
	tags: Tag[];
	selectedTags: string[];
	onTagsChange: (tagIds: string[]) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
}

export function TagSelector({
	tags,
	selectedTags,
	onTagsChange,
	placeholder = "Select tags...",
	className,
	disabled = false,
}: TagSelectorProps) {
	const [open, setOpen] = React.useState(false);

	const handleTagToggle = (tagId: string) => {
		if (selectedTags.includes(tagId)) {
			onTagsChange(selectedTags.filter((id) => id !== tagId));
		} else {
			onTagsChange([...selectedTags, tagId]);
		}
	};

	const handleTagRemove = (tagId: string, e?: React.MouseEvent) => {
		e?.stopPropagation();
		onTagsChange(selectedTags.filter((id) => id !== tagId));
	};

	const selectedTagObjects = tags.filter((tag) =>
		selectedTags.includes(tag.id),
	);

	return (
		<div className={cn("w-full", className)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						aria-expanded={open}
						className={cn(
							"w-full justify-between min-h-10 h-auto",
							disabled && "cursor-not-allowed opacity-50",
						)}
						disabled={disabled}
					>
						<div className="flex flex-wrap gap-1 flex-1">
							{selectedTagObjects.length > 0 ? (
								selectedTagObjects.map((tag) => (
									<Badge
										key={tag.id}
										variant="blank"
										style={{
											backgroundColor: tag.color ? `${tag.color}33` : undefined,
											color: tag.color || undefined,
											borderColor: tag.color ? `${tag.color}66` : undefined,
										}}
										className="flex items-center gap-1 pr-1 border"
									>
										<span>{tag.name}</span>
										<button
											type="button"
											onClick={(e) => handleTagRemove(tag.id, e)}
											className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
											disabled={disabled}
										>
											<X className="h-3 w-3 hover:opacity-70" />
											<span className="sr-only">Remove {tag.name}</span>
										</button>
									</Badge>
								))
							) : (
								<span className="text-muted-foreground">{placeholder}</span>
							)}
						</div>
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-full p-0" align="start">
					<Command>
						<CommandInput placeholder="Search tags..." />
						<CommandList>
							<CommandEmpty>
								<div className="flex flex-col items-center gap-2 py-1">
									<span className="text-sm text-muted-foreground">
										No tags found.
									</span>
									<HandleTag />
								</div>
							</CommandEmpty>
							<CommandGroup>
								{tags.map((tag) => {
									const isSelected = selectedTags.includes(tag.id);
									return (
										<CommandItem
											key={tag.id}
											onSelect={() => handleTagToggle(tag.id)}
											className="cursor-pointer"
										>
											<Checkbox
												checked={isSelected}
												className="mr-2"
												onCheckedChange={() => handleTagToggle(tag.id)}
											/>
											<Badge
												variant="blank"
												style={{
													backgroundColor: tag.color
														? `${tag.color}33`
														: undefined,
													color: tag.color || undefined,
													borderColor: tag.color ? `${tag.color}66` : undefined,
												}}
												className="mr-2 border"
											>
												{tag.name}
											</Badge>
											<Check
												className={cn(
													"ml-auto h-4 w-4",
													isSelected ? "opacity-100" : "opacity-0",
												)}
											/>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
