import { ChevronDown, ChevronRight, FolderInput, Layers } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { ServiceTypeIcon } from "@/components/shared/service-type-icon";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { userName } from "@/components/shared/user-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, pluralize } from "@/lib/utils";
import { api, type RouterOutputs } from "@/utils/api";
import { extractServices, type Services } from "../add-permissions";
import { ProjectAccessDialog } from "./project-access-dialog";

type OrganizationProject =
	RouterOutputs["project"]["allForPermissions"][number];

type TreeService = Services;
interface TreeEnvironment {
	environmentId: string;
	name: string;
	isDefault: boolean;
	assignedTo: string | null;
	services: TreeService[];
}
export interface TreeProject {
	projectId: string;
	name: string;
	assignedTo: string | null;
	environments: TreeEnvironment[];
}

/** Shapes the permissions tree (projects → environments → services) for this view. */
const toProjectTree = (projects: OrganizationProject[]): TreeProject[] =>
	projects.map((project) => ({
		projectId: project.projectId,
		name: project.name,
		assignedTo: project.assignedTo,
		environments: project.environments.map((environment) => ({
			environmentId: environment.environmentId,
			name: environment.name,
			isDefault: environment.isDefault,
			assignedTo: environment.assignedTo,
			services: extractServices(environment).sort((a, b) =>
				a.name.localeCompare(b.name),
			),
		})),
	}));

/** Display names of current organization members, keyed by user id. */
type AssigneeNames = Map<string, string>;

const assigneeLabel = (assignedTo: string | null, names: AssigneeNames) => {
	if (!assignedTo) return "Unassigned";
	return names.get(assignedTo) ?? "Removed user";
};

/** The organization's projects with member names; shared by the Project Assignments card and the remove-user popup. */
export const useProjectTree = (enabled = true) => {
	const { data, isPending } = api.project.allForPermissions.useQuery(
		undefined,
		{ enabled },
	);
	const { data: members, isPending: isMembersPending } = api.user.all.useQuery(
		undefined,
		{ enabled },
	);
	const projects = useMemo(() => toProjectTree(data ?? []), [data]);
	const assigneeNames: AssigneeNames = useMemo(
		() =>
			new Map(
				(members ?? []).map((member) => [
					member.user.id,
					userName(member.user) || member.user.email,
				]),
			),
		[members],
	);
	return {
		projects,
		assigneeNames,
		members: members ?? [],
		isPending: isPending || isMembersPending,
	};
};

export interface Selection {
	projects: Set<string>;
	environments: Set<string>;
	services: Set<string>;
}

export const emptySelection = (): Selection => ({
	projects: new Set(),
	environments: new Set(),
	services: new Set(),
});

export const selectionSize = (selection: Selection) =>
	selection.projects.size +
	selection.environments.size +
	selection.services.size;

interface Match {
	project: (project: TreeProject) => boolean;
	environment: (environment: TreeEnvironment, project: TreeProject) => boolean;
	service: (
		service: TreeService,
		environment: TreeEnvironment,
		project: TreeProject,
	) => boolean;
}

/** Keeps items that match, plus the parents of matching items as context. */
export const filterTree = (projects: TreeProject[], match: Match) =>
	projects.flatMap((project) => {
		const environments = project.environments.flatMap((environment) => {
			const services = environment.services.filter((service) =>
				match.service(service, environment, project),
			);
			return match.environment(environment, project) || services.length > 0
				? [{ ...environment, services }]
				: [];
		});
		return match.project(project) || environments.length > 0
			? [{ ...project, environments }]
			: [];
	});

/** Long lists stay readable: only this many projects are expanded at once. */
const MAX_EXPANDED = 2;

const toggle = (set: Set<string>, id: string, on: boolean) => {
	const next = new Set(set);
	if (on) next.add(id);
	else next.delete(id);
	return next;
};

interface Props {
	projects: TreeProject[];
	assigneeNames: AssigneeNames;
	selection: Selection;
	onSelectionChange: (selection: Selection) => void;
	/** Rows that fail this are shown as context only (greyed, no checkbox). */
	isSelectable?: (assignedTo: string | null, project: TreeProject) => boolean;
	/** Open every project, e.g. while a search or filter narrows the list. */
	expandAll?: boolean;
}

export const ResourceTree = ({
	projects,
	assigneeNames,
	selection,
	onSelectionChange,
	isSelectable = () => true,
	expandAll = false,
}: Props) => {
	const [expanded, setExpanded] = useState<string[]>([]);
	const toggleExpanded = (projectId: string) =>
		setExpanded((open) =>
			open.includes(projectId)
				? open.filter((id) => id !== projectId)
				: [...open, projectId].slice(-MAX_EXPANDED),
		);

	// Ticking a parent ticks or unticks its selectable children; children can
	// still be changed one by one afterwards.
	const setEnvironment = (
		next: Selection,
		project: TreeProject,
		environment: TreeEnvironment,
		on: boolean,
	) => {
		if (isSelectable(environment.assignedTo, project)) {
			next.environments = toggle(
				next.environments,
				environment.environmentId,
				on,
			);
		}
		for (const service of environment.services) {
			if (isSelectable(service.assignedTo ?? null, project)) {
				next.services = toggle(next.services, service.id, on);
			}
		}
	};

	const onProject = (project: TreeProject, on: boolean) => {
		const next = { ...selection };
		if (isSelectable(project.assignedTo, project)) {
			next.projects = toggle(next.projects, project.projectId, on);
		}
		for (const environment of project.environments) {
			setEnvironment(next, project, environment, on);
		}
		onSelectionChange(next);
	};

	const onEnvironment = (
		project: TreeProject,
		environment: TreeEnvironment,
		on: boolean,
	) => {
		const next = { ...selection };
		setEnvironment(next, project, environment, on);
		onSelectionChange(next);
	};

	const onService = (service: TreeService, on: boolean) => {
		onSelectionChange({
			...selection,
			services: toggle(selection.services, service.id, on),
		});
	};

	// Name on the first line, details on the second, so names keep their room on narrow screens.
	const nameWithDetails = (link: ReactNode, details: string) => (
		<div className="flex min-w-0 flex-1 flex-col">
			{link}
			<span className="truncate text-xs text-muted-foreground">{details}</span>
		</div>
	);
	const assignedToText = (assignedTo: string | null | undefined) =>
		`assigned to ${assigneeLabel(assignedTo ?? null, assigneeNames)}`;

	return (
		<div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
			{projects.map((project) => {
				const defaultEnvironment =
					project.environments.find((env) => env.isDefault) ??
					project.environments[0];
				const projectSelectable = isSelectable(project.assignedTo, project);
				const isExpanded = expandAll || expanded.includes(project.projectId);
				const serviceCount = project.environments.reduce(
					(total, environment) => total + environment.services.length,
					0,
				);
				return (
					<div key={project.projectId} className="rounded-lg border">
						<div
							className={cn(
								"flex items-center gap-2 p-3",
								!projectSelectable && "opacity-60",
							)}
						>
							{expandAll ? (
								<span className="size-6 shrink-0" />
							) : (
								<Button
									variant="ghost"
									size="icon"
									className="size-6 shrink-0"
									aria-label={isExpanded ? "Collapse" : "Expand"}
									onClick={() => toggleExpanded(project.projectId)}
								>
									{isExpanded ? (
										<ChevronDown className="size-4" />
									) : (
										<ChevronRight className="size-4" />
									)}
								</Button>
							)}
							<Checkbox
								checked={selection.projects.has(project.projectId)}
								disabled={!projectSelectable}
								onCheckedChange={(checked) => onProject(project, !!checked)}
							/>
							<FolderInput className="size-4 shrink-0 text-muted-foreground" />
							{nameWithDetails(
								<Link
									href={
										defaultEnvironment
											? `/dashboard/project/${project.projectId}/environment/${defaultEnvironment.environmentId}`
											: "/dashboard/projects"
									}
									className="truncate font-medium hover:underline"
								>
									{project.name}
								</Link>,
								`${assignedToText(project.assignedTo)} · ${pluralize(project.environments.length, "environment")} · ${pluralize(serviceCount, "service")}`,
							)}
							<ProjectAccessDialog
								projectId={project.projectId}
								projectName={project.name}
							/>
						</div>
						{isExpanded &&
							project.environments.map((environment) => {
								const environmentSelectable = isSelectable(
									environment.assignedTo,
									project,
								);
								return (
									<div key={environment.environmentId} className="border-t">
										<div
											className={cn(
												"flex items-center gap-2 py-2 pr-3 pl-10",
												!environmentSelectable && "opacity-60",
											)}
										>
											<Checkbox
												checked={selection.environments.has(
													environment.environmentId,
												)}
												disabled={!environmentSelectable}
												onCheckedChange={(checked) =>
													onEnvironment(project, environment, !!checked)
												}
											/>
											<Layers className="size-4 shrink-0 text-muted-foreground" />
											{nameWithDetails(
												<Link
													href={`/dashboard/project/${project.projectId}/environment/${environment.environmentId}`}
													className="truncate text-sm hover:underline"
												>
													{environment.name}
												</Link>,
												assignedToText(environment.assignedTo),
											)}
										</div>
										{environment.services.map((service) => {
											const serviceSelectable = isSelectable(
												service.assignedTo ?? null,
												project,
											);
											return (
												<div
													key={service.id}
													className={cn(
														"flex items-center gap-2 border-t py-2 pr-3 pl-16",
														!serviceSelectable && "opacity-60",
													)}
												>
													<Checkbox
														checked={selection.services.has(service.id)}
														disabled={!serviceSelectable}
														onCheckedChange={(checked) =>
															onService(service, !!checked)
														}
													/>
													<ServiceTypeIcon
														type={service.type}
														className="size-4 shrink-0"
													/>
													{nameWithDetails(
														<Link
															href={`/dashboard/project/${project.projectId}/environment/${environment.environmentId}/services/${service.type}/${service.id}`}
															className="truncate text-sm hover:underline"
														>
															{service.name}
														</Link>,
														assignedToText(service.assignedTo),
													)}
													<StatusTooltip status={service.status ?? "idle"} />
												</div>
											);
										})}
									</div>
								);
							})}
					</div>
				);
			})}
		</div>
	);
};
