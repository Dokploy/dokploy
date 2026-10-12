export type ServiceNode = { id: string };
export type EnvironmentNode = {
	environmentId: string;
	services: ServiceNode[];
};
export type ProjectNode = {
	projectId: string;
	environments: EnvironmentNode[];
};

export type Selection = {
	projects: string[];
	environments: string[];
	services: string[];
};

export type NodeState = "checked" | "indeterminate" | "unchecked";

const environmentServiceIds = (environment: EnvironmentNode) =>
	environment.services.map((service) => service.id);

const projectEnvironmentIds = (project: ProjectNode) =>
	project.environments.map((environment) => environment.environmentId);

const projectServiceIds = (project: ProjectNode) =>
	project.environments.flatMap(environmentServiceIds);

const drop = (list: string[], remove: string[]) => {
	const removeSet = new Set(remove);
	return list.filter((id) => !removeSet.has(id));
};

const add = (list: string[], ids: string[]) => [...new Set([...list, ...ids])];

const materialiseProject = (
	selection: Selection,
	project: ProjectNode,
): Selection => {
	if (!selection.projects.includes(project.projectId)) {
		return selection;
	}
	return {
		projects: selection.projects.filter((id) => id !== project.projectId),
		environments: add(selection.environments, projectEnvironmentIds(project)),
		services: selection.services,
	};
};

const materialiseEnvironment = (
	selection: Selection,
	project: ProjectNode,
	environment: EnvironmentNode,
): Selection => {
	const afterProject = materialiseProject(selection, project);
	if (!afterProject.environments.includes(environment.environmentId)) {
		return afterProject;
	}
	return {
		projects: afterProject.projects,
		environments: afterProject.environments.filter(
			(id) => id !== environment.environmentId,
		),
		services: add(afterProject.services, environmentServiceIds(environment)),
	};
};

export const toggleProject = (
	selection: Selection,
	project: ProjectNode,
	checked: boolean,
): Selection => {
	const cleared: Selection = {
		projects: selection.projects.filter((id) => id !== project.projectId),
		environments: drop(selection.environments, projectEnvironmentIds(project)),
		services: drop(selection.services, projectServiceIds(project)),
	};
	return checked
		? { ...cleared, projects: [...cleared.projects, project.projectId] }
		: cleared;
};

// Unlike toggleProject, toggleEnvironment/toggleService don't strip a held ancestor when checked=true; that's safe because the server-side resolver unions the raw arrays, so a redundant ancestor+descendant selection is merely inert, not incorrect.
export const toggleEnvironment = (
	selection: Selection,
	project: ProjectNode,
	environment: EnvironmentNode,
	checked: boolean,
): Selection => {
	if (checked) {
		return {
			projects: selection.projects,
			environments: add(selection.environments, [environment.environmentId]),
			services: drop(selection.services, environmentServiceIds(environment)),
		};
	}
	const materialised = materialiseProject(selection, project);
	return {
		projects: materialised.projects,
		environments: materialised.environments.filter(
			(id) => id !== environment.environmentId,
		),
		services: drop(materialised.services, environmentServiceIds(environment)),
	};
};

export const toggleService = (
	selection: Selection,
	project: ProjectNode,
	environment: EnvironmentNode,
	serviceId: string,
	checked: boolean,
): Selection => {
	if (checked) {
		return { ...selection, services: add(selection.services, [serviceId]) };
	}
	const materialised = materialiseEnvironment(selection, project, environment);
	return {
		...materialised,
		services: materialised.services.filter((id) => id !== serviceId),
	};
};

export const isInherited = (
	selection: Selection,
	project: ProjectNode,
	environment: EnvironmentNode,
) =>
	selection.projects.includes(project.projectId) ||
	selection.environments.includes(environment.environmentId);

export const projectState = (
	selection: Selection,
	project: ProjectNode,
): NodeState => {
	if (selection.projects.includes(project.projectId)) {
		return "checked";
	}
	const holdsEnvironment = projectEnvironmentIds(project).some((id) =>
		selection.environments.includes(id),
	);
	const holdsService = projectServiceIds(project).some((id) =>
		selection.services.includes(id),
	);
	return holdsEnvironment || holdsService ? "indeterminate" : "unchecked";
};

export const environmentState = (
	selection: Selection,
	project: ProjectNode,
	environment: EnvironmentNode,
): NodeState => {
	if (isInherited(selection, project, environment)) {
		return "checked";
	}
	return environmentServiceIds(environment).some((id) =>
		selection.services.includes(id),
	)
		? "indeterminate"
		: "unchecked";
};

export const serviceState = (
	selection: Selection,
	project: ProjectNode,
	environment: EnvironmentNode,
	serviceId: string,
): NodeState =>
	isInherited(selection, project, environment) ||
	selection.services.includes(serviceId)
		? "checked"
		: "unchecked";
