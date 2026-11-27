import { useCommandState } from "cmdk";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CheckIcon, GitFork, Lock } from "lucide-react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
	groupRepositories,
	parseRepositoryDate,
	type RepositoryOption,
} from "@/utils/repository-options";

interface Props<T> {
	repositories: T[] | undefined;
	toOption: (repository: T) => RepositoryOption;
	isSelected: (repository: T) => boolean;
	onSelect: (repository: T) => void;
}

export function RepositoryCommandGroups<T>({
	repositories,
	toOption,
	isSelected,
	onSelect,
}: Props<T>) {
	// The totals describe the whole list, so they would be wrong while cmdk is filtering it.
	const isSearching = useCommandState((state) => state.search.length > 0);
	const { active, archived } = groupRepositories(repositories ?? [], toOption);

	const renderItems = (entries: typeof active) =>
		entries.map(({ repository, option }) => (
			<RepositoryCommandItem
				key={option.value}
				option={option}
				selected={isSelected(repository)}
				onSelect={() => onSelect(repository)}
			/>
		));

	return (
		// Rows lay out by the list's own width rather than the viewport's. The containment
		// this sets up also stops a long name from widening Radix ScrollArea's table layout.
		<div className="@container">
			{active.length > 0 && (
				<CommandGroup
					heading={
						isSearching ? "Repositories" : `Repositories · ${active.length}`
					}
				>
					{renderItems(active)}
				</CommandGroup>
			)}
			{archived.length > 0 && (
				<CommandGroup
					heading={isSearching ? "Archived" : `Archived · ${archived.length}`}
				>
					{renderItems(archived)}
				</CommandGroup>
			)}
		</div>
	);
}

interface RepositoryCommandItemProps {
	option: RepositoryOption;
	selected: boolean;
	onSelect: () => void;
}

const RepositoryCommandItem = ({
	option,
	selected,
	onSelect,
}: RepositoryCommandItemProps) => {
	const lastActivity = parseRepositoryDate(option.lastActivityAt);
	const visibilityLabel =
		option.visibility === "internal" ? "Internal" : "Private";

	return (
		<CommandItem value={option.value} onSelect={onSelect}>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5 @lg:flex-row @lg:items-center @lg:gap-2">
				<span
					className={cn(
						"truncate",
						option.isArchived &&
							"text-muted-foreground group-data-selected/command-item:text-foreground",
					)}
				>
					{option.name}
				</span>
				<span className="flex items-center gap-2 text-muted-foreground text-xs @lg:flex-1">
					<span className="min-w-0 truncate">{option.owner}</span>
					{option.visibility !== "public" && (
						<span title={visibilityLabel} className="flex shrink-0">
							<Lock aria-hidden className="size-3" />
							<span className="sr-only">{visibilityLabel}</span>
						</span>
					)}
					{option.isFork && (
						<span className="flex shrink-0 items-center gap-1">
							<GitFork aria-hidden className="size-3" />
							Fork
						</span>
					)}
					<span className="ml-auto flex shrink-0 items-center gap-2">
						{option.isArchived && <Badge variant="yellow">Archived</Badge>}
						{lastActivity && (
							<time
								dateTime={lastActivity.toISOString()}
								title={`Last updated ${format(lastActivity, "PPpp")}`}
								className="tabular-nums"
							>
								{formatDistanceToNowStrict(lastActivity, { addSuffix: true })}
							</time>
						)}
					</span>
				</span>
			</span>
			<CheckIcon
				className={cn("size-4", selected ? "opacity-100" : "opacity-0")}
			/>
		</CommandItem>
	);
};

export const ArchivedRepositoryAlert = () => (
	<AlertBlock type="warning">
		This repository is archived. It's read-only, so automatic deployments won't
		trigger, but you can still deploy manually.
	</AlertBlock>
);
