import type { ProjectsRepository } from "../../domain/repositories/projects.repository";

/**
 * Update project use case
 *
 * @param projectId ID of the project to update
 * @param name New name of the project
 * @param description New description of the project
 * @param repository Projects repository
 */
export const updateProjectUseCase = async (
	projectId: string,
	name: string,
	description: string | undefined,
	repository: ProjectsRepository,
): Promise<void> => {
	const input = {
		projectId,
		name,
		description,
	};

	const { mutateAsync: updateMutation } = repository.update();

	await updateMutation(input as any);

	await repository.invalidateAll();
};
