import { quote } from "shell-quote";

export interface ComposeVolumeMount {
	name: string;
}

export interface ComposeBindMount {
	source: string;
	destination: string;
}

export interface ComposeMountsDiscovery {
	volumes: ComposeVolumeMount[];
	binds: ComposeBindMount[];
}

interface RawDockerMount {
	Type: string;
	Name?: string;
	Source?: string;
	Destination?: string;
}

/**
 * Builds the command that lists the container IDs belonging to a compose
 * project (docker-compose) or swarm stack (stack), so their mounts can be
 * inspected. Assumes a single-node deploy target, consistent with how the
 * rest of this codebase inspects compose/stack containers (e.g.
 * `getContainersByAppNameMatch`).
 */
export const buildListComposeContainerIdsCommand = (
	appName: string,
	composeType: "docker-compose" | "stack",
): string => {
	const label =
		composeType === "stack"
			? `com.docker.stack.namespace=${appName}`
			: `com.docker.compose.project=${appName}`;
	return `docker ps -a --filter ${quote([`label=${label}`])} --format '{{.ID}}'`;
};

/** Builds the command that dumps each container's `.Mounts` array as one JSON line per container. */
export const buildInspectMountsCommand = (containerIds: string[]): string => {
	const ids = containerIds.map((id) => quote([id])).join(" ");
	return `docker inspect ${ids} --format '{{json .Mounts}}'`;
};

/**
 * Parses the (line-delimited, one JSON array per container) output of
 * `buildInspectMountsCommand` into a de-duplicated list of named volumes
 * and bind mounts actually used by the running containers.
 */
export const parseComposeMountsOutput = (
	stdout: string,
): ComposeMountsDiscovery => {
	const volumeNames = new Set<string>();
	const binds = new Map<string, ComposeBindMount>();

	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		let mounts: RawDockerMount[];
		try {
			mounts = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (!Array.isArray(mounts)) continue;

		for (const mount of mounts) {
			if (mount.Type === "volume" && mount.Name) {
				volumeNames.add(mount.Name);
			} else if (mount.Type === "bind" && mount.Source && mount.Destination) {
				binds.set(`${mount.Source}::${mount.Destination}`, {
					source: mount.Source,
					destination: mount.Destination,
				});
			}
		}
	}

	return {
		volumes: [...volumeNames].map((name) => ({ name })),
		binds: [...binds.values()],
	};
};
