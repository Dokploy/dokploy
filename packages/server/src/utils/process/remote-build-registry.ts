/**
 * Process-wide registry of the build-server commands this process is waiting
 * on, keyed by deployment id.
 *
 * A cancel kills the build on the build server first. This registry is the
 * other half: it lets the cancel also drop the local ssh connection that is
 * waiting for that command, so the deployment job (and with it its queue slot
 * and its group lock) ends even when the build server never answers.
 *
 * The app can end up with more than one copy of this module (the dist build
 * behind the `@dokploy/server` barrel and a bundled deep import), so the map
 * lives in a slot on `globalThis` that every copy shares.
 */

export type RemoteBuildAbort = (reason: string) => void;

const SLOT = Symbol.for("dokploy.remoteBuildAbortRegistry");

const registry = (): Map<string, Set<RemoteBuildAbort>> => {
	const holder = globalThis as unknown as Record<
		symbol,
		Map<string, Set<RemoteBuildAbort>> | undefined
	>;
	let map = holder[SLOT];
	if (!map) {
		map = new Map();
		holder[SLOT] = map;
	}
	return map;
};

/** Registers a running command; returns the function that unregisters it. */
export const registerRemoteBuild = (
	deploymentId: string,
	abort: RemoteBuildAbort,
): (() => void) => {
	const map = registry();
	let aborts = map.get(deploymentId);
	if (!aborts) {
		aborts = new Set();
		map.set(deploymentId, aborts);
	}
	aborts.add(abort);
	return () => {
		const current = registry().get(deploymentId);
		if (!current) return;
		current.delete(abort);
		if (current.size === 0) registry().delete(deploymentId);
	};
};

/** True while a command of this deployment is running in this process. */
export const hasRunningRemoteBuild = (deploymentId: string) =>
	(registry().get(deploymentId)?.size ?? 0) > 0;

/**
 * Drops the local connection of every command of this deployment that is still
 * running in this process. Returns how many were aborted.
 */
export const abortRemoteBuild = (deploymentId: string, reason: string) => {
	const aborts = registry().get(deploymentId);
	if (!aborts) return 0;
	let count = 0;
	for (const abort of [...aborts]) {
		try {
			abort(reason);
			count++;
		} catch (error) {
			console.error("Could not abort a remote build connection", error);
		}
	}
	return count;
};
