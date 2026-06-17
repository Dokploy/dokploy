import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { and, eq } from "drizzle-orm";

import semver from "semver";
import { db } from "../db";
import { compose } from "../db/schema";
import {
	initializeStandaloneTraefik,
	initializeTraefikService,
	type TraefikOptions,
} from "../setup/traefik-setup";
export interface IUpdateData {
	latestVersion: string | null;
	updateAvailable: boolean;
}

export const DEFAULT_UPDATE_DATA: IUpdateData = {
	latestVersion: null,
	updateAvailable: false,
};

/** Returns current Dokploy docker image tag or `latest` by default. */
export const getDokployImageTag = () => {
	return process.env.RELEASE_TAG || "latest";
};

/** Returns Dokploy docker service image digest */
export const getServiceImageDigest = async () => {
	const { stdout } = await execAsync(
		"docker service inspect dokploy --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'",
	);

	const currentDigest = stdout.trim().split("@")[1];

	if (!currentDigest) {
		throw new Error("Could not get current service image digest");
	}

	return currentDigest;
};

/** Returns latest version and whether an update is available by checking
 *  GitHub releases on the DevinoSolutions fork. */
export const getUpdateData = async (
	currentVersion: string,
): Promise<IUpdateData> => {
	try {
		const response = await fetch(
			"https://api.github.com/repos/DevinoSolutions/dokploy-community/releases/latest",
			{
				method: "GET",
				headers: {
					Accept: "application/vnd.github+json",
					"User-Agent": "dokploy-community",
				},
			},
		);

		if (!response.ok) {
			return DEFAULT_UPDATE_DATA;
		}

		const release = (await response.json()) as { tag_name: string };
		const latestVersion = release.tag_name;

		if (!latestVersion) {
			return DEFAULT_UPDATE_DATA;
		}

		const cleanedCurrent = semver.clean(currentVersion);
		const cleanedLatest = semver.clean(latestVersion);

		if (!cleanedCurrent || !cleanedLatest) {
			return DEFAULT_UPDATE_DATA;
		}

		const updateAvailable = semver.gt(cleanedLatest, cleanedCurrent);

		return {
			latestVersion,
			updateAvailable,
		};
	} catch (error) {
		console.error("Error fetching update data:", error);
		return DEFAULT_UPDATE_DATA;
	}
};

interface TreeDataItem {
	id: string;
	name: string;
	type: "file" | "directory";
	children?: TreeDataItem[];
}

export const readDirectory = async (
	dirPath: string,
	serverId?: string,
): Promise<TreeDataItem[]> => {
	if (serverId) {
		const { stdout } = await execAsyncRemote(
			serverId,
			`
process_items() {
    local parent_dir="$1"
    local __resultvar=$2

    local items_json=""
    local first=true
    for item in "$parent_dir"/*; do
        [ -e "$item" ] || continue
        process_item "$item" item_json
        if [ "$first" = true ]; then
            first=false
            items_json="$item_json"
        else
            items_json="$items_json,$item_json"
        fi
    done

    eval $__resultvar="'[$items_json]'"
}

process_item() {
    local item_path="$1"
    local __resultvar=$2

    local item_name=$(basename "$item_path")
    local escaped_name=$(echo "$item_name" | sed 's/"/\\"/g')
    local escaped_path=$(echo "$item_path" | sed 's/"/\\"/g')

    if [ -d "$item_path" ]; then
        # Is directory
        process_items "$item_path" children_json
        local json='{"id":"'"$escaped_path"'","name":"'"$escaped_name"'","type":"directory","children":'"$children_json"'}'
    else
        # Is file
        local json='{"id":"'"$escaped_path"'","name":"'"$escaped_name"'","type":"file"}'
    fi

    eval $__resultvar="'$json'"
}

root_dir=${dirPath}

process_items "$root_dir" json_output

echo "$json_output"
			`,
		);
		const result = JSON.parse(stdout);
		return result;
	}

	const stack = [dirPath];
	const result: TreeDataItem[] = [];
	const parentMap: Record<string, TreeDataItem[]> = {};

	while (stack.length > 0) {
		const currentPath = stack.pop();
		if (!currentPath) continue;

		const items = readdirSync(currentPath, { withFileTypes: true });
		const currentDirectoryResult: TreeDataItem[] = [];

		for (const item of items) {
			const fullPath = join(currentPath, item.name);
			if (item.isDirectory()) {
				stack.push(fullPath);
				const directoryItem: TreeDataItem = {
					id: fullPath,
					name: item.name,
					type: "directory",
					children: [],
				};
				currentDirectoryResult.push(directoryItem);
				parentMap[fullPath] = directoryItem.children as TreeDataItem[];
			} else {
				const fileItem: TreeDataItem = {
					id: fullPath,
					name: item.name,
					type: "file",
				};
				currentDirectoryResult.push(fileItem);
			}
		}

		if (parentMap[currentPath]) {
			parentMap[currentPath].push(...currentDirectoryResult);
		} else {
			result.push(...currentDirectoryResult);
		}
	}
	return result;
};

export const getDockerResourceType = async (
	resourceName: string,
	serverId?: string,
) => {
	try {
		let result = "";
		const command = `
RESOURCE_NAME="${resourceName}"
if docker service inspect "$RESOURCE_NAME" >/dev/null 2>&1; then
	echo "service"
elif docker inspect "$RESOURCE_NAME" >/dev/null 2>&1; then
	echo "standalone"
else
	echo "unknown"
fi`;

		if (serverId) {
			const { stdout } = await execAsyncRemote(serverId, command);
			result = stdout.trim();
		} else {
			const { stdout } = await execAsync(command);
			result = stdout.trim();
		}
		if (result === "service") {
			return "service";
		}
		if (result === "standalone") {
			return "standalone";
		}
		return "unknown";
	} catch (error) {
		console.error(error);
		return "unknown";
	}
};

export const reloadDockerResource = async (
	resourceName: string,
	serverId?: string,
	version?: string,
) => {
	const resourceType = await getDockerResourceType(resourceName, serverId);
	let command = "";
	if (resourceType === "service") {
		if (resourceName === "dokploy") {
			const currentImageTag = getDokployImageTag();
			let imageTag = version;
			if (currentImageTag === "canary" || currentImageTag === "feature") {
				imageTag = currentImageTag;
			}

			command = `docker service update --force --image ghcr.io/devinosolutions/dokploy-community:${imageTag} ${resourceName}`;
		} else {
			command = `docker service update --force ${resourceName}`;
		}
	} else if (resourceType === "standalone") {
		command = `docker restart ${resourceName}`;
	} else {
		throw new Error("Resource type not found");
	}
	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};

export const readEnvironmentVariables = async (
	resourceName: string,
	serverId?: string,
) => {
	const resourceType = await getDockerResourceType(resourceName, serverId);
	let command = "";
	if (resourceType === "service") {
		command = `docker service inspect ${resourceName} --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}'`;
	} else if (resourceType === "standalone") {
		command = `docker container inspect ${resourceName} --format '{{json .Config.Env}}'`;
	}
	let result = "";
	if (serverId) {
		const { stdout } = await execAsyncRemote(serverId, command);
		result = stdout.trim();
	} else {
		const { stdout } = await execAsync(command);
		result = stdout.trim();
	}
	if (result === "null") {
		return "";
	}
	return JSON.parse(result)?.join("\n");
};

export const readPorts = async (
	resourceName: string,
	serverId?: string,
): Promise<
	{ targetPort: number; publishedPort: number; protocol?: string }[]
> => {
	const resourceType = await getDockerResourceType(resourceName, serverId);
	let command = "";
	if (resourceType === "service") {
		command = `docker service inspect ${resourceName} --format '{{json .Spec.EndpointSpec.Ports}}'`;
	} else if (resourceType === "standalone") {
		command = `docker container inspect ${resourceName} --format '{{json .NetworkSettings.Ports}}'`;
	} else {
		throw new Error("Resource type not found");
	}
	let result = "";
	if (serverId) {
		const { stdout } = await execAsyncRemote(serverId, command);
		result = stdout.trim();
	} else {
		const { stdout } = await execAsync(command);
		result = stdout.trim();
	}

	if (result === "null") {
		return [];
	}

	const parsedResult = JSON.parse(result);

	if (resourceType === "service") {
		return parsedResult
			.map((port: any) => ({
				targetPort: port.TargetPort,
				publishedPort: port.PublishedPort,
				protocol: port.Protocol,
			}))
			.filter((port: any) => port.targetPort !== 80 && port.targetPort !== 443);
	}
	const ports: {
		targetPort: number;
		publishedPort: number;
		protocol?: string;
	}[] = [];
	const seenPorts = new Set<string>();
	for (const key in parsedResult) {
		if (Object.hasOwn(parsedResult, key)) {
			const containerPortMappings = parsedResult[key];
			const protocol = key.split("/")[1];
			const targetPort = Number.parseInt(key.split("/")[0] ?? "0", 10);

			// Take only the first mapping to avoid duplicates (IPv4 and IPv6)
			const firstMapping = containerPortMappings[0];
			if (firstMapping) {
				const publishedPort = Number.parseInt(firstMapping.HostPort, 10);
				const portKey = `${targetPort}-${publishedPort}-${protocol}`;
				if (!seenPorts.has(portKey)) {
					seenPorts.add(portKey);
					ports.push({
						targetPort: targetPort,
						publishedPort: publishedPort,
						protocol: protocol,
					});
				}
			}
		}
	}
	return ports.filter(
		(port: any) => port.targetPort !== 80 && port.targetPort !== 443,
	);
};

export const checkPortInUse = async (
	port: number,
	serverId?: string,
): Promise<{ isInUse: boolean; conflictingContainer?: string }> => {
	try {
		// Check if port is in use by a Docker container
		const dockerCommand = `docker ps -a --format '{{.Names}}' | grep -v '^dokploy-traefik$' | while read name; do docker port "$name" 2>/dev/null | grep -q ':${port}' && echo "$name" && break; done || true`;
		const { stdout: dockerOut } = serverId
			? await execAsyncRemote(serverId, dockerCommand)
			: await execAsync(dockerCommand);

		const container = dockerOut.trim();

		if (container) {
			return {
				isInUse: true,
				conflictingContainer: `container "${container}"`,
			};
		}

		// Check if port is in use by a host-level service (non-Docker)
		// Dokploy runs inside a container, so we spawn an ephemeral container
		// with --net=host to share the host's network stack and use nc -z to
		// check if something is listening on the port
		const hostCommand = `docker run --rm --net=host busybox sh -c 'nc -z 0.0.0.0 ${port} 2>/dev/null && echo in_use || echo free'`;
		const { stdout: hostOut } = serverId
			? await execAsyncRemote(serverId, hostCommand)
			: await execAsync(hostCommand);

		if (hostOut.includes("in_use")) {
			return {
				isInUse: true,
				conflictingContainer: "a host-level service",
			};
		}

		return { isInUse: false };
	} catch (error) {
		console.error("Error checking port availability:", error);
		return { isInUse: false };
	}
};

export const writeTraefikSetup = async (input: TraefikOptions) => {
	const resourceType = await getDockerResourceType(
		"dokploy-traefik",
		input.serverId,
	);

	if (resourceType === "service") {
		await initializeTraefikService({
			env: input.env,
			additionalPorts: input.additionalPorts,
			serverId: input.serverId,
		});
		await reconnectServicesToTraefik(input.serverId);
	} else if (resourceType === "standalone") {
		await initializeStandaloneTraefik({
			env: input.env,
			additionalPorts: input.additionalPorts,
			serverId: input.serverId,
		});

		await reconnectServicesToTraefik(input.serverId);
	} else {
		throw new Error("Traefik resource type not found");
	}
};

export const reconnectServicesToTraefik = async (serverId?: string) => {
	const composeResult = await db.query.compose.findMany({
		where: and(
			...(serverId ? [eq(compose.serverId, serverId)] : []),
			eq(compose.isolatedDeployment, true),
		),
	});

	if (!composeResult) {
		return;
	}
	let commands = "";

	for (const compose of composeResult) {
		commands += `docker network connect ${compose.appName} $(docker ps --filter "name=dokploy-traefik" -q) >/dev/null 2>&1\n`;
	}

	if (serverId) {
		await execAsyncRemote(serverId, commands);
	} else {
		await execAsync(commands);
	}
};
