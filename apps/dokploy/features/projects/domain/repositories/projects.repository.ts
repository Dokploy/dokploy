import type { Project } from "../models/project.models";

/**
 * Projects repository
 */
export interface ProjectsRepository {
	/**
	 * Get all projects
	 */
	getAll: () => {
		data: Project[] | undefined;
		isLoading: boolean;
		error: Error | null;
	};

	/**
	 * Get one project by ID
	 */
	getOne: (
		projectId: string,
		enabled?: boolean,
	) => { data: Project | undefined; isLoading: boolean; error: Error | null };

	/**
	 * Create new project
	 */
	create: () => any;

	/**
	 * Update existing project
	 */
	update: () => any;

	/**
	 * Delete existing project
	 */
	delete: () => any;

	/**
	 * Invalidate all projects cache
	 */
	invalidateAll: () => Promise<void>;
}
