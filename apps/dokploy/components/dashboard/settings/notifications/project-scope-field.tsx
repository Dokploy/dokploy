import { FolderKanban, Globe, Loader2, Search, X } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type ProjectScope = "all" | "specific";

export interface ProjectOption {
	projectId: string;
	name: string;
	description: string | null;
}

const normalize = (value: string) =>
	value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const byName = (a: ProjectOption, b: ProjectOption) =>
	a.name.localeCompare(b.name);

/** Title + description shared by the "Project events" and "Server events" groups. */
export const ActionGroupHeader = ({
	id,
	title,
	description,
	children,
}: {
	id?: string;
	title: string;
	description: string;
	children?: ReactNode;
}) => (
	<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div className="flex flex-col gap-1">
			<h4 id={id} className="text-sm font-medium leading-none">
				{title}
			</h4>
			<p className="text-sm text-muted-foreground">{description}</p>
		</div>
		{children}
	</div>
);

const SCOPE_OPTIONS = [
	{ value: "all", icon: Globe, label: "All projects" },
	{ value: "specific", icon: FolderKanban, label: "Specific projects" },
] as const;

const ScopeToggle = ({
	value,
	onChange,
	labelledBy,
}: {
	value: ProjectScope;
	onChange: (scope: ProjectScope) => void;
	labelledBy: string;
}) => (
	<RadioGroupPrimitive.Root
		value={value}
		onValueChange={(next) => onChange(next as ProjectScope)}
		aria-labelledby={labelledBy}
		orientation="horizontal"
		className="inline-flex h-9 w-full shrink-0 items-center rounded-lg bg-muted p-1 sm:w-auto"
	>
		{SCOPE_OPTIONS.map(({ value: optionValue, icon: Icon, label }) => (
			<RadioGroupPrimitive.Item
				key={optionValue}
				value={optionValue}
				className={cn(
					"inline-flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 text-sm font-medium text-foreground/60 outline-none transition-all",
					"hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
					"data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm",
					"dark:text-muted-foreground dark:data-[state=checked]:border-input dark:data-[state=checked]:bg-input/30 dark:data-[state=checked]:text-foreground",
				)}
			>
				<Icon className="size-3.5" aria-hidden />
				{label}
			</RadioGroupPrimitive.Item>
		))}
	</RadioGroupPrimitive.Root>
);

interface PickerProps {
	projects: ProjectOption[];
	isLoading: boolean;
	selectedIds: string[];
	onSelectedChange: (ids: string[]) => void;
	error?: string;
}

const ProjectPicker = ({
	projects,
	isLoading,
	selectedIds,
	onSelectedChange,
	error,
}: PickerProps) => {
	const [search, setSearch] = useState("");
	// Projects selected when the picker appears are listed first (useful when
	// editing with many projects), without rows jumping while the user toggles.
	const [pinnedIds] = useState(() => new Set(selectedIds));
	const errorId = useId();
	const itemIdPrefix = useId();
	// Fades the bottom edge while more projects are hidden below the fold.
	const listRef = useRef<HTMLUListElement>(null);
	const [hasMoreBelow, setHasMoreBelow] = useState(false);
	const updateScrollHint = useCallback(() => {
		const list = listRef.current;
		setHasMoreBelow(
			!!list && list.scrollHeight - list.scrollTop - list.clientHeight > 1,
		);
	}, []);

	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const knownIds = useMemo(
		() => new Set(projects.map((project) => project.projectId)),
		[projects],
	);
	// Links to projects the current user cannot see are kept untouched.
	const hiddenCount = selectedIds.filter((id) => !knownIds.has(id)).length;
	const visibleSelectedCount = selectedIds.length - hiddenCount;

	const ordered = useMemo(
		() => [
			...projects.filter((p) => pinnedIds.has(p.projectId)).sort(byName),
			...projects.filter((p) => !pinnedIds.has(p.projectId)).sort(byName),
		],
		[projects, pinnedIds],
	);
	const query = normalize(search.trim());
	const matches = query
		? ordered.filter((project) =>
				normalize(`${project.name} ${project.description ?? ""}`).includes(
					query,
				),
			)
		: ordered;
	const unselectedMatches = matches.filter(
		(project) => !selectedSet.has(project.projectId),
	);
	const hasSelectedMatch = matches.some((project) =>
		selectedSet.has(project.projectId),
	);

	// Re-measure when the rendered rows change (search, loading, data).
	useEffect(updateScrollHint, [updateScrollHint, matches.length, isLoading]);

	const toggle = (projectId: string, checked: boolean) => {
		onSelectedChange(
			checked
				? [...selectedIds, projectId]
				: selectedIds.filter((id) => id !== projectId),
		);
	};
	const selectMatches = () =>
		onSelectedChange([
			...selectedIds,
			...unselectedMatches.map((project) => project.projectId),
		]);
	const clearMatches = () => {
		const matchIds = new Set(matches.map((project) => project.projectId));
		onSelectedChange(selectedIds.filter((id) => !matchIds.has(id)));
	};

	return (
		<div className="flex flex-col gap-2">
			<div
				className={cn(
					"overflow-hidden rounded-lg border shadow-xs transition-[border-color,box-shadow]",
					"has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50",
					error && "border-destructive",
				)}
			>
				<div className="flex items-center gap-2 border-b px-3">
					<Search
						className="size-4 shrink-0 text-muted-foreground"
						aria-hidden
					/>
					<input
						type="text"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						onKeyDown={(event) => {
							// Enter must not submit the notification form.
							if (event.key === "Enter") event.preventDefault();
							if (event.key === "Escape" && search) {
								event.preventDefault();
								event.stopPropagation();
								setSearch("");
							}
						}}
						placeholder="Search projects…"
						aria-label="Search projects"
						aria-describedby={error ? errorId : undefined}
						disabled={isLoading}
						className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
					/>
					{search && (
						<button
							type="button"
							onClick={() => setSearch("")}
							className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
							aria-label="Clear search"
						>
							<X className="size-4" />
						</button>
					)}
				</div>

				<div className="flex min-h-9 items-center justify-between gap-2 border-b bg-muted/40 px-3 text-xs text-muted-foreground">
					<span aria-live="polite" className="whitespace-nowrap">
						{visibleSelectedCount} of {projects.length} selected
					</span>
					<span className="flex items-center">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							disabled={isLoading || unselectedMatches.length === 0}
							onClick={selectMatches}
						>
							{query ? "Select shown" : "Select all"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							disabled={isLoading || !hasSelectedMatch}
							onClick={clearMatches}
						>
							{query ? "Clear shown" : "Clear"}
						</Button>
					</span>
				</div>

				{isLoading ? (
					<div className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Loading projects…
					</div>
				) : matches.length === 0 ? (
					<div className="flex h-24 items-center justify-center px-3 text-center text-sm text-muted-foreground">
						{projects.length === 0
							? "No projects in this organization yet."
							: `No projects match "${search.trim()}".`}
					</div>
				) : (
					<div className="relative">
						<ul
							ref={listRef}
							onScroll={updateScrollHint}
							className="max-h-56 overflow-y-auto overscroll-contain p-1"
						>
							{matches.map((project) => {
								const checked = selectedSet.has(project.projectId);
								const itemId = `${itemIdPrefix}-${project.projectId}`;
								return (
									<li key={project.projectId}>
										<label
											htmlFor={itemId}
											className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent"
										>
											<Checkbox
												id={itemId}
												checked={checked}
												onCheckedChange={(value) =>
													toggle(project.projectId, value === true)
												}
											/>
											<span className="flex min-w-0 flex-col">
												<span className="truncate text-sm">{project.name}</span>
												{project.description && (
													<span className="truncate text-xs text-muted-foreground">
														{project.description}
													</span>
												)}
											</span>
										</label>
									</li>
								);
							})}
						</ul>
						<div
							aria-hidden
							className={cn(
								"pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-popover via-popover/70 to-transparent transition-opacity",
								hasMoreBelow ? "opacity-100" : "opacity-0",
							)}
						/>
					</div>
				)}
			</div>

			{error && (
				<p id={errorId} className="text-sm font-medium text-destructive">
					{error}
				</p>
			)}
			{hiddenCount > 0 && (
				<p className="text-xs text-muted-foreground">
					Also linked to {hiddenCount} project{hiddenCount > 1 ? "s" : ""} you
					don't have access to. They will be kept.
				</p>
			)}
		</div>
	);
};

interface ProjectEventsGroupProps extends Omit<PickerProps, "projects"> {
	projects: ProjectOption[] | undefined;
	scope: ProjectScope;
	onScopeChange: (scope: ProjectScope) => void;
	/** Editing a scoped notification whose linked projects were all deleted. */
	isOrphaned: boolean;
	/** The switches of the project-level actions. */
	children: ReactNode;
}

/**
 * Groups the actions that are filtered by project with the scope selector,
 * so the relationship between both is visible without extra explanation.
 */
export const ProjectEventsGroup = ({
	projects,
	isLoading,
	scope,
	onScopeChange,
	selectedIds,
	onSelectedChange,
	isOrphaned,
	error,
	children,
}: ProjectEventsGroupProps) => {
	const titleId = useId();
	return (
		<section className="flex flex-col gap-3" aria-labelledby={titleId}>
			<ActionGroupHeader
				id={titleId}
				title="Project events"
				description={
					scope === "all"
						? "Sent for every project, including ones created later."
						: "Sent only for the projects selected below."
				}
			>
				<ScopeToggle
					value={scope}
					onChange={onScopeChange}
					labelledBy={titleId}
				/>
			</ActionGroupHeader>

			{isOrphaned && scope === "specific" && (
				<AlertBlock type="warning">
					The projects this notification was limited to have been deleted, so it
					is not sending project events. Choose projects again or switch to All
					projects.
				</AlertBlock>
			)}

			{scope === "specific" && (
				<ProjectPicker
					projects={projects ?? []}
					isLoading={isLoading}
					selectedIds={selectedIds}
					onSelectedChange={onSelectedChange}
					error={error}
				/>
			)}

			<div className="grid gap-4 md:grid-cols-2">{children}</div>
		</section>
	);
};
