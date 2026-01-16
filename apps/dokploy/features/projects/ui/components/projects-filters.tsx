import { ArrowUpDown, Search } from "lucide-react";
import { FocusShortcutInput } from "@/components/shared/focus-shortcut-input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface Props {
	searchQuery: string;
	onSearchChange: (value: string) => void;
	sortBy: string;
	onSortChange: (value: string) => void;
}

/**
 * Projects filters component.
 */
export const ProjectsFilters = ({
	searchQuery,
	onSearchChange,
	sortBy,
	onSortChange,
}: Props) => {
	return (
		<div className="flex max-sm:flex-col gap-4 items-center w-full">
			<div className="flex-1 relative max-sm:w-full">
				<FocusShortcutInput
					placeholder="Filter projects..."
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					className="pr-10"
				/>

				<Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
			</div>
			<div className="flex items-center gap-2 min-w-48 max-sm:w-full">
				<ArrowUpDown className="size-4 text-muted-foreground" />
				<Select value={sortBy} onValueChange={onSortChange}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Sort by..." />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="name-asc">Name (A-Z)</SelectItem>
						<SelectItem value="name-desc">Name (Z-A)</SelectItem>
						<SelectItem value="createdAt-desc">Newest first</SelectItem>
						<SelectItem value="createdAt-asc">Oldest first</SelectItem>
						<SelectItem value="services-desc">Most services</SelectItem>
						<SelectItem value="services-asc">Least services</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	);
};