import type { ProjectsRepository } from "../../domain/repositories/projects.repository";

/**
 * Delete project use case
 *
 * @param projectId ID of the project to delete
 * @param repository Projects repository
 */
export const deleteProjectUseCase = async (
	projectId: string,
	repository: ProjectsRepository,
): Promise<void> => {
	const { mutateAsync } = repository.delete();

	await mutateAsync({ projectId });

	await repository.invalidateAll();
};
