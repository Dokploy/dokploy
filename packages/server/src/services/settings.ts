import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { and, eq } from "drizzle-orm";

import semver from "semver";
import { quote } from "shell-quote";
import { db } from "../db";
import { compose } from "../db/schema";
import {
	type CaddyOptions,
	initializeCaddyService,
	initializeStandaloneCaddy,
} from "../setup/caddy-setup";
import {
	initializeStandaloneTraefik,
	initializeTraefikService,
	type TraefikOptions,
} from "../setup/traefik-setup";
import type { CaddyMigrationResourceSnapshot } from "../utils/caddy/migration/types";
import type { WebServerProvider } from "../utils/web-server/providers";
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

/** Returns latest version number and information whether server update is available by comparing current image's digest against digest for provided image tag via Docker hub API. */
export const getUpdateData = async (
	currentVersion: string,
): Promise<IUpdateData> => {
	try {
		const baseUrl =
			"https://hub.docker.com/v2/repositories/dokploy/dokploy/tags";
		let url: string | null = `${baseUrl}?page_size=100`;
		let allResults: { digest: string; name: string }[] = [];

		// Fetch all tags from Docker Hub
		while (url) {
			const response = await fetch(url, {
				method: "GET",
				headers: { "Content-Type": "application/json" },
			});

			const data = (await response.json()) as {
				next: string | null;
				results: { digest: string; name: string }[];
			};

			allResults = allResults.concat(data.results);
			url = data?.next;
		}

		const currentImageTag = getDokployImageTag();

		// Special handling for canary and feature branches
		// For development versions (canary/feature), don't perform update checks
		// These are unstable versions that change frequently, and users on these
		// branches are expected to manually manage updates
		if (currentImageTag === "canary" || currentImageTag === "feature") {
			const currentDigest = await getServiceImageDigest();
			const latestDigest = allResults.find(
				(t) => t.name === currentImageTag,
			)?.digest;
			if (!latestDigest) {
				return DEFAULT_UPDATE_DATA;
			}
			if (currentDigest !== latestDigest) {
				return {
					latestVersion: currentImageTag,
					updateAvailable: true,
				};
			}
			return {
				latestVersion: currentImageTag,
				updateAvailable: false,
			};
		}

		// For stable versions, use semver comparison
		// Find the "latest" tag and get its digest
		const latestTag = allResults.find((t) => t.name === "latest");

		if (!latestTag) {
			return DEFAULT_UPDATE_DATA;
		}

		// Find the versioned tag (v0.x.x) that has the same digest as "latest"
		const latestVersionTag = allResults.find(
			(t) => t.digest === latestTag.digest && t.name.startsWith("v"),
		);

		if (!latestVersionTag) {
			return DEFAULT_UPDATE_DATA;
		}

		const latestVersion = latestVersionTag.name;

		// Use semver to compare versions for stable releases
		const cleanedCurrent = semver.clean(currentVersion);
		const cleanedLatest = semver.clean(latestVersion);

		if (!cleanedCurrent || !cleanedLatest) {
			return DEFAULT_UPDATE_DATA;
		}

		// Check if the latest version is greater than the current version
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

			command = `docker service update --force --image dokploy/dokploy:${imageTag} ${resourceName}`;
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

const runDockerResourceCommand = async (command: string, serverId?: string) => {
	if (serverId) {
		return execAsyncRemote(serverId, command);
	}
	return execAsync(command);
};

const readDockerResourceJson = async <T = Record<string, unknown>>(
	command: string,
	serverId?: string,
): Promise<T | undefined> => {
	const { stdout } = await runDockerResourceCommand(command, serverId);
	const trimmed = stdout.trim();
	return trimmed ? (JSON.parse(trimmed) as T) : undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;

const asStringRecord = (value: unknown): Record<string, string> | undefined => {
	const record = asRecord(value);
	if (!record) return undefined;
	return Object.fromEntries(
		Object.entries(record).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
};

const asRecordArray = (
	value: unknown,
): Array<Record<string, unknown>> | undefined =>
	Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					!!item && typeof item === "object",
			)
		: undefined;

const asStringArray = (value: unknown): string[] | undefined =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: undefined;

const readDockerResourceImage = async (
	resourceName: string,
	resourceType: "service" | "standalone",
	serverId?: string,
) => {
	const command =
		resourceType === "service"
			? `docker service inspect ${resourceName} --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'`
			: `docker container inspect ${resourceName} --format '{{.Config.Image}}'`;
	const { stdout } = await runDockerResourceCommand(command, serverId);
	return stdout.trim() || undefined;
};

export const getDockerResourceSnapshot = async (
	resourceName: string,
	serverId?: string,
): Promise<CaddyMigrationResourceSnapshot> => {
	const resourceType = await getDockerResourceType(resourceName, serverId);
	if (resourceType === "unknown") {
		return { resourceName, resourceType, running: false };
	}

	if (resourceType === "service") {
		const spec =
			(await readDockerResourceJson<Record<string, unknown>>(
				`docker service inspect ${resourceName} --format '{{json .Spec}}'`,
				serverId,
			).catch(() => undefined)) ?? {};
		const mode = asRecord(spec.Mode);
		const replicated = asRecord(mode?.Replicated);
		const replicas = Number(replicated?.Replicas ?? 1);
		const taskTemplate = asRecord(spec.TaskTemplate);
		const containerSpec = asRecord(taskTemplate?.ContainerSpec);
		const endpointSpec = asRecord(spec.EndpointSpec);
		return {
			resourceName,
			resourceType,
			replicas,
			running: replicas > 0,
			env: await readEnvironmentVariables(resourceName, serverId).catch(
				() => undefined,
			),
			additionalPorts: await readPorts(resourceName, serverId).catch(() => []),
			image: await readDockerResourceImage(
				resourceName,
				resourceType,
				serverId,
			).catch(() => undefined),
			mounts: asRecordArray(containerSpec?.Mounts),
			networks: asRecordArray(taskTemplate?.Networks),
			labels: asStringRecord(spec.Labels),
			containerLabels: asStringRecord(containerSpec?.Labels),
			placement: asRecord(taskTemplate?.Placement),
			endpointPorts: asRecordArray(endpointSpec?.Ports),
		};
	}

	const inspect =
		(await readDockerResourceJson<Record<string, unknown>>(
			`docker container inspect ${resourceName} --format '{{json .}}'`,
			serverId,
		).catch(() => undefined)) ?? {};
	const state = asRecord(inspect.State);
	const hostConfig = asRecord(inspect.HostConfig);
	const networkSettings = asRecord(inspect.NetworkSettings);
	const networksRecord = asRecord(networkSettings?.Networks);
	const config = asRecord(inspect.Config);
	return {
		resourceName,
		resourceType,
		running: state?.Running === true,
		env: await readEnvironmentVariables(resourceName, serverId).catch(
			() => undefined,
		),
		additionalPorts: await readPorts(resourceName, serverId).catch(() => []),
		image: await readDockerResourceImage(
			resourceName,
			resourceType,
			serverId,
		).catch(() => undefined),
		binds: asStringArray(hostConfig?.Binds),
		networks: networksRecord ? Object.keys(networksRecord) : undefined,
		labels: asStringRecord(config?.Labels),
		restartPolicy: asRecord(hostConfig?.RestartPolicy),
	};
};

export const stopDockerResource = async (
	resourceName: string,
	serverId?: string,
) => {
	const resourceType = await getDockerResourceType(resourceName, serverId);
	if (resourceType === "service") {
		await runDockerResourceCommand(
			`docker service scale ${resourceName}=0`,
			serverId,
		);
		return;
	}
	if (resourceType === "standalone") {
		await runDockerResourceCommand(`docker stop ${resourceName}`, serverId);
	}
};

export const startDockerResourceFromSnapshot = async (
	snapshot: CaddyMigrationResourceSnapshot,
	serverId?: string,
) => {
	if (!snapshot.running) {
		return;
	}
	if (snapshot.resourceType === "service") {
		await runDockerResourceCommand(
			`docker service scale ${snapshot.resourceName}=${snapshot.replicas ?? 1}`,
			serverId,
		);
		return;
	}
	if (snapshot.resourceType === "standalone") {
		await runDockerResourceCommand(
			`docker start ${snapshot.resourceName}`,
			serverId,
		);
	}
};

const envStringToArray = (env?: string) =>
	env && env !== "[redacted]" ? env.split("\n").filter(Boolean) : undefined;

export const ensureTraefikRunningFromSnapshot = async (
	snapshot?: CaddyMigrationResourceSnapshot,
	serverId?: string,
) => {
	let restartError: unknown;
	if (snapshot?.running) {
		try {
			await startDockerResourceFromSnapshot(snapshot, serverId);
			await waitForDockerResourceRunning("dokploy-traefik", serverId, {
				retries: 10,
				intervalMs: 1000,
			});
			return;
		} catch (error) {
			restartError = error;
		}
	}

	const recreateInput: TraefikOptions = {
		env: envStringToArray(snapshot?.env),
		additionalPorts: snapshot?.additionalPorts ?? [],
		image: snapshot?.image,
		serverId,
		binds: snapshot?.binds,
		networks: snapshot?.networks?.filter(
			(item): item is string => typeof item === "string",
		),
		labels: snapshot?.labels,
		restartPolicy: snapshot?.restartPolicy as TraefikOptions["restartPolicy"],
		replicas: snapshot?.replicas,
		serviceMounts: snapshot?.mounts as TraefikOptions["serviceMounts"],
		serviceNetworks: snapshot?.networks?.filter(
			(item): item is Record<string, unknown> => typeof item === "object",
		) as TraefikOptions["serviceNetworks"],
		servicePlacement: snapshot?.placement as TraefikOptions["servicePlacement"],
		serviceLabels: snapshot?.labels,
		serviceContainerLabels: snapshot?.containerLabels,
		serviceEndpointPorts:
			snapshot?.endpointPorts as TraefikOptions["serviceEndpointPorts"],
	};

	const runExactRecreate = async () => {
		if (snapshot?.resourceType === "service") {
			await initializeTraefikService(recreateInput);
			await reconnectServicesToTraefik(serverId);
			return;
		}
		if (snapshot?.resourceType === "standalone") {
			await initializeStandaloneTraefik(recreateInput);
			await reconnectServicesToTraefik(serverId);
			return;
		}
		await writeTraefikSetup(recreateInput);
	};

	try {
		try {
			await runExactRecreate();
		} catch (exactError) {
			if (snapshot?.resourceType === "unknown") {
				throw exactError;
			}
			try {
				await writeTraefikSetup(recreateInput);
			} catch (fallbackError) {
				const exactMessage =
					exactError instanceof Error
						? exactError.message
						: "exact Traefik recreation failed";
				const fallbackMessage =
					fallbackError instanceof Error
						? fallbackError.message
						: "generic Traefik recreation failed";
				throw new Error(
					`Exact Traefik recreation failed: ${exactMessage}; generic recreation failed: ${fallbackMessage}`,
				);
			}
		}
		await waitForDockerResourceRunning("dokploy-traefik", serverId, {
			retries: 20,
			intervalMs: 1000,
		});
	} catch (error) {
		const recreateMessage =
			error instanceof Error ? error.message : "Traefik recreation failed";
		if (restartError) {
			const restartMessage =
				restartError instanceof Error
					? restartError.message
					: "Traefik restart failed";
			throw new Error(
				`Unable to restore Traefik. Restart failed: ${restartMessage}; recreate failed: ${recreateMessage}`,
			);
		}
		throw error;
	}
};

export const waitForDockerResourceRunning = async (
	resourceName: string,
	serverId?: string,
	options: { retries?: number; intervalMs?: number } = {},
) => {
	const retries = options.retries ?? 20;
	const intervalMs = options.intervalMs ?? 1000;
	for (let attempt = 0; attempt < retries; attempt++) {
		const snapshot = await getDockerResourceSnapshot(resourceName, serverId);
		if (snapshot.resourceType === "service" && snapshot.running) {
			const { stdout } = await runDockerResourceCommand(
				`docker service ps ${resourceName} --filter desired-state=running --format '{{.CurrentState}}' | grep -m1 '^Running' || true`,
				serverId,
			);
			if (stdout.trim()) {
				return snapshot;
			}
		} else if (snapshot.running) {
			return snapshot;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error(`Docker resource ${resourceName} did not become running`);
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
		const dockerCommand = `docker ps -a --format '{{.Names}}' | grep -Ev '^(dokploy-traefik|dokploy-caddy)$' | while read name; do docker port "$name" 2>/dev/null | grep -q ':${port}' && echo "$name" && break; done || true`;
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

export const writeCaddySetup = async (input: CaddyOptions) => {
	const resourceType = await getDockerResourceType(
		"dokploy-caddy",
		input.serverId,
	);
	const traefikResourceType =
		resourceType === "unknown"
			? await getDockerResourceType("dokploy-traefik", input.serverId)
			: resourceType;
	const fallbackResourceType =
		traefikResourceType === "unknown"
			? await getDockerResourceType("dokploy", input.serverId)
			: traefikResourceType;
	const setupType =
		fallbackResourceType === "service" ? "service" : "standalone";

	if (setupType === "service") {
		await initializeCaddyService({
			env: input.env,
			additionalPorts: input.additionalPorts,
			serverId: input.serverId,
			letsEncryptEmail: input.letsEncryptEmail,
			trustedProxies: input.trustedProxies,
			accessLogs: input.accessLogs,
		});
		await reconnectServicesToWebServer("dokploy-caddy", input.serverId);
	} else {
		await initializeStandaloneCaddy({
			env: input.env,
			additionalPorts: input.additionalPorts,
			serverId: input.serverId,
			letsEncryptEmail: input.letsEncryptEmail,
			trustedProxies: input.trustedProxies,
			accessLogs: input.accessLogs,
		});

		await reconnectServicesToWebServer("dokploy-caddy", input.serverId);
	}
};

export const writeWebServerSetup = async (
	provider: WebServerProvider,
	input: TraefikOptions | CaddyOptions,
) => {
	if (provider === "caddy") {
		return writeCaddySetup(input as CaddyOptions);
	}

	return writeTraefikSetup(input as TraefikOptions);
};

export const writeTraefikSetup = async (input: TraefikOptions) => {
	const resourceType = await getDockerResourceType(
		"dokploy-traefik",
		input.serverId,
	);
	const fallbackResourceType =
		resourceType === "unknown"
			? await getDockerResourceType("dokploy", input.serverId)
			: resourceType;
	const setupType =
		fallbackResourceType === "service" ? "service" : "standalone";

	if (setupType === "service") {
		await initializeTraefikService(input);
		await reconnectServicesToTraefik(input.serverId);
	} else {
		await initializeStandaloneTraefik(input);

		await reconnectServicesToTraefik(input.serverId);
	}
};

export const reconnectServicesToWebServer = async (
	resourceName: "dokploy-traefik" | "dokploy-caddy",
	serverId?: string,
) => {
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
		const networkName = quote([compose.appName]);
		const quotedResourceName = quote([resourceName]);
		commands += `if docker service inspect ${quotedResourceName} >/dev/null 2>&1; then\n`;
		commands += `  docker service inspect ${quotedResourceName} --format '{{range .Spec.TaskTemplate.Networks}}{{println .Target}}{{end}}' | grep -qx ${networkName} || docker service update --network-add ${networkName} ${quotedResourceName} >/dev/null\n`;
		commands += "else\n";
		commands += `  docker network connect ${networkName} $(docker ps --filter "name=${resourceName}" -q) >/dev/null 2>&1 || true\n`;
		commands += "fi\n";
	}

	if (serverId) {
		await execAsyncRemote(serverId, commands);
	} else {
		await execAsync(commands);
	}
};

export const reconnectServicesToTraefik = async (serverId?: string) => {
	await reconnectServicesToWebServer("dokploy-traefik", serverId);
};
