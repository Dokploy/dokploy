export type ComposeStatus = "idle" | "running" | "done" | "error";

interface ContainerLike {
	state: string;
}

/**
 * A compose marked as "idle" (stopped) can still have running containers,
 * e.g. after `docker compose stop` followed by a Docker daemon restart with
 * `restart: unless-stopped`. In that case the real state wins.
 */
export const resolveComposeStatus = (
	storedStatus: ComposeStatus,
	containers: ContainerLike[],
): ComposeStatus => {
	if (storedStatus !== "idle") return storedStatus;
	const hasRunning = containers.some(
		(container) => container.state.trim().toLowerCase() === "running",
	);
	return hasRunning ? "done" : storedStatus;
};
