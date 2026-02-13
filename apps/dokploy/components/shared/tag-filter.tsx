import { Filter, X } from "lucide-react";
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

	const selectedTagObjects = tags.filter((tag) =>
		selectedTags.includes(tag.id),
	);

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className={cn("gap-2", selectedTags.length > 0 && "border-primary")}
					>
						<Filter className="h-4 w-4" />
						<span>Filter by Tag</span>
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
							<CommandInput placeholder="Search tags..." className="h-9" />
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
												className="flex-1 border"
											>
												{tag.name}
											</Badge>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			{selectedTagObjects.length > 0 && (
				<div className="flex flex-wrap gap-1 items-center">
					{selectedTagObjects.map((tag) => (
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
								onClick={() =>
									onTagsChange(selectedTags.filter((id) => id !== tag.id))
								}
								className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
							>
								<X className="h-3 w-3 hover:opacity-70" />
								<span className="sr-only">Remove {tag.name} filter</span>
							</button>
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}
