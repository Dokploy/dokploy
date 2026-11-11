import {
	ChevronsUpDown,
	FolderKanban,
	Globe,
	Loader2,
	Search,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
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
	CommandSeparator,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export type ProjectScope = "all" | "specific";

export interface ProjectOption {
	projectId: string;
	name: string;
	description: string | null;
}

interface Props {
	projects: ProjectOption[] | undefined;
	isLoading: boolean;
	scope: ProjectScope;
	onScopeChange: (scope: ProjectScope) => void;
	selectedIds: string[];
	onSelectedChange: (ids: string[]) => void;
	/** None of the enabled actions is filtered by project. */
	hasProjectActions: boolean;
	/** Editing a scoped notification whose linked projects were all deleted. */
	isOrphaned: boolean;
	error?: string;
}

const COLLAPSED_CHIP_LIMIT = 8;

const normalize = (value: string) =>
	value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SCOPE_OPTIONS = [
	{
		value: "all",
		icon: Globe,
		title: "All projects",
		description: "Includes projects created later.",
	},
	{
		value: "specific",
		icon: FolderKanban,
		title: "Specific projects",
		description: "Only the projects you choose.",
	},
] as const;

export const ProjectScopeField = ({
	projects,
	isLoading,
	scope,
	onScopeChange,
	selectedIds,
	onSelectedChange,
	hasProjectActions,
	isOrphaned,
	error,
}: Props) => {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [showAllChips, setShowAllChips] = useState(false);
	// Selection snapshot taken when the list opens, so selected projects are
	// listed first without rows jumping around while the user toggles them.
	const [pinnedIds, setPinnedIds] = useState<string[]>([]);

	const projectList = projects ?? [];
	const projectsById = useMemo(
		() => new Map(projectList.map((project) => [project.projectId, project])),
		[projectList],
	);
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const selectedProjects = selectedIds
		.map((id) => projectsById.get(id))
		.filter((project): project is ProjectOption => !!project)
		.sort((a, b) => a.name.localeCompare(b.name));
	const hiddenCount = selectedIds.length - selectedProjects.length;

	const query = normalize(search.trim());
	const matches = query
		? projectList.filter((project) =>
				normalize(`${project.name} ${project.description ?? ""}`).includes(
					query,
				),
			)
		: projectList;
	const pinnedSet = new Set(pinnedIds);
	const pinnedMatches = matches.filter((p) => pinnedSet.has(p.projectId));
	const otherMatches = matches.filter((p) => !pinnedSet.has(p.projectId));
	const unselectedMatches = matches.filter(
		(project) => !selectedSet.has(project.projectId),
	);

	const toggle = (projectId: string) => {
		onSelectedChange(
			selectedSet.has(projectId)
				? selectedIds.filter((id) => id !== projectId)
				: [...selectedIds, projectId],
		);
	};

	const selectMatches = () => {
		onSelectedChange([
			...selectedIds,
			...unselectedMatches.map((project) => project.projectId),
		]);
	};

	const clearMatches = () => {
		const matchIds = new Set(matches.map((project) => project.projectId));
		onSelectedChange(selectedIds.filter((id) => !matchIds.has(id)));
	};

	const handleOpenChange = (next: boolean) => {
		if (next) {
			setPinnedIds(selectedIds);
		} else {
			setSearch("");
		}
		setOpen(next);
	};

	const visibleChips = showAllChips
		? selectedProjects
		: selectedProjects.slice(0, COLLAPSED_CHIP_LIMIT);
	const collapsedCount = selectedProjects.length - visibleChips.length;
	const isDisabled = !hasProjectActions;

	const renderItem = (project: ProjectOption) => {
		const isSelected = selectedSet.has(project.projectId);
		return (
			<CommandItem
				key={project.projectId}
				value={project.projectId}
				onSelect={() => toggle(project.projectId)}
				className="cursor-pointer"
			>
				<Checkbox
					checked={isSelected}
					tabIndex={-1}
					aria-hidden
					className="pointer-events-none"
				/>
				<div className="flex min-w-0 flex-col">
					<span className="truncate">{project.name}</span>
					{project.description && (
						<span className="truncate text-xs text-muted-foreground">
							{project.description}
						</span>
					)}
				</div>
			</CommandItem>
		);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<Label className="text-lg font-semibold leading-none tracking-tight">
					Project scope
				</Label>
				<p className="text-sm text-muted-foreground">
					Which projects trigger App Deploy, App Build Error, Database Backup
					and Volume Backup. Server-level actions are always sent.
				</p>
			</div>

			{isDisabled && (
				<AlertBlock type="info">
					None of the selected actions depends on a project. Enable App Deploy,
					App Build Error, Database Backup or Volume Backup to filter by
					project.
				</AlertBlock>
			)}

			{isOrphaned && !isDisabled && (
				<AlertBlock type="warning">
					The projects this notification was limited to have been deleted, so it
					is not sending project events. Choose projects again or switch to All
					projects.
				</AlertBlock>
			)}

			<RadioGroup
				value={scope}
				onValueChange={(value) => onScopeChange(value as ProjectScope)}
				disabled={isDisabled}
				className={cn(
					"grid grid-cols-1 gap-3 sm:grid-cols-2",
					isDisabled && "opacity-60",
				)}
			>
				{SCOPE_OPTIONS.map((option) => {
					const Icon = option.icon;
					const id = `notification-scope-${option.value}`;
					return (
						<div key={option.value} className="relative">
							<RadioGroupItem
								value={option.value}
								id={id}
								className="peer sr-only absolute"
							/>
							<Label
								htmlFor={id}
								className={cn(
									"flex h-full items-start gap-3 rounded-lg border-2 border-muted p-3 transition-colors",
									"peer-data-[state=checked]:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
									isDisabled
										? "cursor-not-allowed"
										: "cursor-pointer hover:bg-accent",
								)}
							>
								<Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<span className="flex flex-col gap-0.5">
									<span className="text-sm font-medium">{option.title}</span>
									<span className="text-xs font-normal text-muted-foreground">
										{option.description}
									</span>
								</span>
							</Label>
						</div>
					);
				})}
			</RadioGroup>

			{scope === "specific" && (
				<div className="flex flex-col gap-2">
					<Popover open={open} onOpenChange={handleOpenChange} modal>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="outline"
								role="combobox"
								aria-expanded={open}
								aria-invalid={!!error}
								disabled={isDisabled || isLoading}
								className={cn(
									"w-full justify-between font-normal bg-input",
									error && "border-destructive",
								)}
							>
								<span className="flex items-center gap-2 truncate">
									{isLoading ? (
										<>
											<Loader2 className="size-4 animate-spin" />
											Loading projects…
										</>
									) : selectedIds.length > 0 ? (
										<>
											<FolderKanban className="size-4 text-muted-foreground" />
											{selectedIds.length} of {projectList.length + hiddenCount}{" "}
											projects selected
										</>
									) : (
										<>
											<Search className="size-4 text-muted-foreground" />
											<span className="text-muted-foreground">
												Search and choose projects…
											</span>
										</>
									)}
								</span>
								<ChevronsUpDown className="size-4 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="start"
							className="w-[var(--radix-popover-trigger-width)] min-w-72 gap-0 p-0"
						>
							<Command shouldFilter={false}>
								<CommandInput
									value={search}
									onValueChange={setSearch}
									placeholder="Search by name or description…"
								/>
								<div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
									<span>
										{query
											? `${matches.length} of ${projectList.length} projects`
											: `${projectList.length} projects`}
									</span>
									<span className="flex items-center gap-1">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 px-2 text-xs"
											disabled={unselectedMatches.length === 0}
											onClick={selectMatches}
										>
											{query
												? `Select ${unselectedMatches.length} matching`
												: "Select all"}
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 px-2 text-xs"
											disabled={
												!matches.some((p) => selectedSet.has(p.projectId))
											}
											onClick={clearMatches}
										>
											{query ? "Clear matching" : "Clear"}
										</Button>
									</span>
								</div>
								<CommandSeparator />
								<CommandList className="max-h-72">
									<CommandEmpty>
										{projectList.length === 0
											? "No projects in this organization yet."
											: `No projects match "${search.trim()}".`}
									</CommandEmpty>
									{pinnedMatches.length > 0 && (
										<CommandGroup heading="Selected">
											{pinnedMatches.map(renderItem)}
										</CommandGroup>
									)}
									{otherMatches.length > 0 && (
										<CommandGroup
											heading={
												pinnedMatches.length > 0 ? "Other projects" : undefined
											}
										>
											{otherMatches.map(renderItem)}
										</CommandGroup>
									)}
								</CommandList>
								<CommandSeparator />
								<div className="flex items-center justify-between px-3 py-2">
									<span className="text-xs text-muted-foreground">
										{selectedIds.length} selected
									</span>
									<Button
										type="button"
										size="sm"
										className="h-7"
										onClick={() => handleOpenChange(false)}
									>
										Done
									</Button>
								</div>
							</Command>
						</PopoverContent>
					</Popover>

					{selectedProjects.length > 0 && (
						<div className="flex flex-wrap items-center gap-1.5">
							{visibleChips.map((project) => (
								<Badge
									key={project.projectId}
									variant="secondary"
									className="gap-1 pr-1 font-normal"
								>
									<span className="max-w-48 truncate">{project.name}</span>
									<button
										type="button"
										onClick={() => toggle(project.projectId)}
										disabled={isDisabled}
										className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
										aria-label={`Remove ${project.name}`}
									>
										<X className="size-3" />
									</button>
								</Badge>
							))}
							{(collapsedCount > 0 || showAllChips) &&
								selectedProjects.length > COLLAPSED_CHIP_LIMIT && (
									<Button
										type="button"
										variant="link"
										size="sm"
										className="h-auto px-1 text-xs"
										onClick={() => setShowAllChips((value) => !value)}
									>
										{showAllChips ? "Show less" : `+${collapsedCount} more`}
									</Button>
								)}
						</div>
					)}

					{hiddenCount > 0 && (
						<p className="text-xs text-muted-foreground">
							Also linked to {hiddenCount} project
							{hiddenCount > 1 ? "s" : ""} you don't have access to. They will
							be kept.
						</p>
					)}
				</div>
			)}

			{error && <p className="text-sm font-medium text-destructive">{error}</p>}
		</div>
	);
};
