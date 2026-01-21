import type { Environment } from "../../domain/models/project.models";
import type { ProjectsRepository } from "../../domain/repositories/projects.repository";

interface CreateProjectResult {
	shouldNavigate: boolean;
	navigationPath?: string;
}

/**
 * Create project use case
 *
 * @param name Name of the new project
 * @param description Description of the new project
 * @param repository Projects repository
 */
export const createProjectUseCase = async (
	name: string,
	description: string | undefined,
	repository: ProjectsRepository,
): Promise<CreateProjectResult> => {
	const input = {
		name,
		description,
	};

	const { mutateAsync: createMutation } = repository.create();

	const result = await createMutation(input);

	await repository.invalidateAll();

	// Business logic: Navigation logic for new projects
	if (result) {
		const projectIdToUse = result.projectId;
		const defaultEnv = result.environments?.find(
			(env: Environment) => env.isDefault,
		);

		if (projectIdToUse && defaultEnv) {
			return {
				shouldNavigate: true,
				navigationPath: `/dashboard/project/${projectIdToUse}/environment/${defaultEnv.environmentId}`,
			};
		}
	}

	return {
		shouldNavigate: false,
	};
};
