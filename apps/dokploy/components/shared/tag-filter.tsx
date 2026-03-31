import { Tags } from "lucide-react";
import * as React from "react";
import { HandleTag } from "@/components/dashboard/settings/tags/handle-tag";
import { TagBadge } from "@/components/shared/tag-badge";
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

interface TagFilterProps {
	tags: Tag[];
	selectedTags: string[];
	onTagsChange: (tagIds: string[]) => void;
	className?: string;
}

export function TagFilter({
	tags,
	selectedTags,
	onTagsChange,
	className,
}: TagFilterProps) {
	const [open, setOpen] = React.useState(false);

	const handleTagToggle = (tagId: string) => {
		if (selectedTags.includes(tagId)) {
			onTagsChange(selectedTags.filter((id) => id !== tagId));
		} else {
			onTagsChange([...selectedTags, tagId]);
		}
	};

	const handleClearAll = (e: React.MouseEvent) => {
		e.stopPropagation();
		onTagsChange([]);
	};

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className={cn("gap-2", selectedTags.length > 0 && "border-primary")}
					>
						<Tags className="h-4 w-4" />
						<span>Tags</span>
						{selectedTags.length > 0 && (
							<Badge variant="secondary" className="ml-1 px-1 py-0">
								{selectedTags.length}
							</Badge>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-64 p-0" align="start">
					<Command>
						<div className="flex items-center border-b px-3">
							<CommandInput
								placeholder="Search tags..."
								className="h-9 focus-visible:ring-0"
							/>
							{selectedTags.length > 0 && (
								<Button
									variant="ghost"
									size="sm"
									onClick={handleClearAll}
									className="h-8 px-2 text-xs"
								>
									Clear
								</Button>
							)}
						</div>
						<CommandList>
							<CommandEmpty>
								<span className="text-sm text-muted-foreground">
									No tags found.
								</span>
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
											<TagBadge name={tag.name} color={tag.color} />
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
						<div className="border-t px-1 py-1 [&_button]:w-full [&_button]:justify-start [&_button]:h-7 [&_button]:text-xs [&_button]:font-normal [&_button]:text-muted-foreground [&_button]:bg-transparent [&_button]:shadow-none [&_button]:hover:text-foreground [&_button]:hover:bg-accent">
							<HandleTag />
						</div>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
