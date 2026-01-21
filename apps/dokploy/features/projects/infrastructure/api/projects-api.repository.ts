import { api } from "@/utils/api";
import type { Project } from "../../domain/models/project.models";
import type { ProjectsRepository } from "../../domain/repositories/projects.repository";

/**
 * Adapters to transform API data to domain models
 */
const adaptApiProjectToDomain = (apiProject: any): Project => ({
	projectId: apiProject.projectId,
	name: apiProject.name,
	description: apiProject.description || undefined,
	createdAt: apiProject.createdAt,
	env: apiProject.env || undefined,
	environments: apiProject.environments || [],
});

/**
 * Projects API repository
 */
export const useProjectsRepository = (): ProjectsRepository => {
	const utils = api.useUtils();

	return {
		getAll: () => {
			const { data, isLoading, error } = api.project.all.useQuery();

			return {
				data: data ? data.map(adaptApiProjectToDomain) : undefined,
				isLoading,
				error: error ? new Error(error.message) : null,
			};
		},

		getOne: (projectId: string, enabled = true) => {
			const { data, isLoading, error } = api.project.one.useQuery(
				{ projectId },
				{ enabled: !!projectId && enabled },
			);

			return {
				data: data ? adaptApiProjectToDomain(data) : undefined,
				isLoading,
				error: error ? new Error(error.message) : null,
			};
		},

		create: () => {
			return api.project.create.useMutation({
				onSuccess: async (result) => {
					await utils.project.all.invalidate();
					return result && "project" in result
						? adaptApiProjectToDomain(result.project)
						: result;
				},
			});
		},

		update: () => {
			return api.project.update.useMutation({
				onSuccess: async (result) => {
					await utils.project.all.invalidate();
					return adaptApiProjectToDomain(result);
				},
			});
		},

		delete: () => {
			return api.project.remove.useMutation({
				onSuccess: async () => {
					await utils.project.all.invalidate();
				},
			});
		},

		invalidateAll: async () => {
			await utils.project.all.invalidate();
		},
	};
};
