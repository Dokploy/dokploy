interface ContainerOption {
	containerId: string;
}

export const resolveContainerSelection = (
	currentContainerId: string | undefined,
	containers: readonly ContainerOption[] | undefined,
) => {
	if (!containers) {
		return currentContainerId;
	}

	if (
		currentContainerId &&
		containers.some(({ containerId }) => containerId === currentContainerId)
	) {
		return currentContainerId;
	}

	return containers[0]?.containerId;
};
