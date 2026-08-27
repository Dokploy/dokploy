import path from "node:path";

/**
 * Decides whether a compose bind-mount host path is safe to copy
 * automatically as part of a cross-server move. Bind sources that live
 * inside the compose project's own managed directory (which is fully
 * transferred as part of the move) are safe. Anything else is an arbitrary
 * host path (e.g. `/var/run/docker.sock`, a user's home directory, `/etc`)
 * that Dokploy doesn't own and has no way to safely copy - the move must be
 * rejected rather than silently dropping or mis-copying that data.
 */
export const isBindSourceWithinProjectDirectory = (
	bindSource: string,
	projectDirectory: string,
): boolean => {
	const normalizedProject = path.resolve(projectDirectory);
	const normalizedSource = path.resolve(bindSource);

	return (
		normalizedSource === normalizedProject ||
		normalizedSource.startsWith(`${normalizedProject}${path.sep}`)
	);
};

export interface UnsafeBindMount {
	source: string;
	destination: string;
}

/**
 * Filters a list of bind mounts (as discovered from the running containers)
 * down to the ones considered unsafe to move automatically.
 */
export const findUnsafeBindMounts = (
	bindMounts: UnsafeBindMount[],
	projectDirectory: string,
): UnsafeBindMount[] => {
	return bindMounts.filter(
		(mount) =>
			!isBindSourceWithinProjectDirectory(mount.source, projectDirectory),
	);
};
