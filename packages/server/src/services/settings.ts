import { readdirSync } from "node:fs";
import { join } from "node:path";
import { docker } from "@dokploy/server/constants";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import semver from "semver";
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

const DEFAULT_IMAGE_REPOSITORY = "dokploy/dokploy";

type ImageRefParts = {
	registry: string;
	repository: string;
	tag: string | null;
	digest: string | null;
};

const getDokployImageBase = () =>
	process.env.DOKPLOY_IMAGE || DEFAULT_IMAGE_REPOSITORY;

const parseImageReference = (image: string): ImageRefParts => {
	const [nameWithTag, digest] = image.split("@");
	const lastColon = nameWithTag.lastIndexOf(":");
	const lastSlash = nameWithTag.lastIndexOf("/");
	let tag: string | null = null;
	let name = nameWithTag;
	if (lastColon > lastSlash) {
		tag = nameWithTag.slice(lastColon + 1);
		name = nameWithTag.slice(0, lastColon);
	}
	const segments = name.split("/");
	const hasRegistry =
		segments.length > 1 &&
		(segments[0].includes(".") ||
			segments[0].includes(":") ||
			segments[0] === "localhost");
	const registry = hasRegistry ? segments[0] : "docker.io";
	const repository = hasRegistry ? segments.slice(1).join("/") : name;
	return {
		registry,
		repository,
		tag,
		digest: digest || null,
	};
};

const buildImageName = (registry: string, repository: string) =>
	registry === "docker.io" ? repository : `${registry}/${repository}`;

/** Returns current Dokploy docker image tag or `latest` by default. */
export const getDokployImageTag = () => {
	return (
		process.env.RELEASE_TAG ||
		parseImageReference(getDokployImageBase()).tag ||
		"latest"
	);
};

export const getDokployImage = () => {
	const parts = parseImageReference(getDokployImageBase());
	const imageName = buildImageName(parts.registry, parts.repository);
	if (parts.digest) {
		return `${imageName}@${parts.digest}`;
	}
	return `${imageName}:${getDokployImageTag()}`;
};

export const buildDokployImage = (tag: string) => {
	const parts = parseImageReference(getDokployImageBase());
	const imageName = buildImageName(parts.registry, parts.repository);
	return `${imageName}:${tag}`;
};

const isChannelTag = (tag: string) => tag !== "latest" && !semver.clean(tag);

type RegistryTag = { name: string; digest?: string };

const listDockerHubTags = async (
	repository: string,
): Promise<RegistryTag[]> => {
	let url: string | null = `https://hub.docker.com/v2/repositories/${repository}/tags?page_size=100`;
	let allResults: RegistryTag[] = [];
	while (url) {
		const response = await fetch(url, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
		});
		if (!response.ok) {
			throw new Error(`Docker Hub tag fetch failed (${response.status})`);
		}
		const data = (await response.json()) as {
			next: string | null;
			results: { digest?: string; name: string }[];
		};
		allResults = allResults.concat(
			(data.results || []).map((item) => ({
				name: item.name,
				digest: item.digest,
			})),
		);
		url = data?.next;
	}
	return allResults;
};

const getGhcrAuthToken = async (repository: string) => {
	const scope = `repository:${repository}:pull`;
	const url = `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(
		scope,
	)}`;
	const headers: Record<string, string> = {};
	const username = process.env.DOKPLOY_REGISTRY_USERNAME;
	const token = process.env.DOKPLOY_REGISTRY_TOKEN;
	if (username && token) {
		headers.Authorization = `Basic ${Buffer.from(
			`${username}:${token}`,
		).toString("base64")}`;
	}
	const response = await fetch(url, { headers });
	if (!response.ok) {
		console.warn(
			`GHCR token request failed (${response.status}) for ${repository}`,
		);
		return null;
	}
	const data = (await response.json()) as {
		token?: string;
		access_token?: string;
	};
	return data.token ?? data.access_token ?? null;
};

const listGhcrTags = async (repository: string): Promise<RegistryTag[]> => {
	const token = await getGhcrAuthToken(repository);
	const headers: Record<string, string> = {};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	const response = await fetch(
		`https://ghcr.io/v2/${repository}/tags/list`,
		{
			method: "GET",
			headers,
		},
	);
	if (!response.ok) {
		throw new Error(`GHCR tag fetch failed (${response.status})`);
	}
	const data = (await response.json()) as { tags?: string[] };
	return (data.tags || []).map((name) => ({ name }));
};

const getGhcrTagDigest = async (repository: string, tag: string) => {
	const token = await getGhcrAuthToken(repository);
	const headers: Record<string, string> = {
		Accept:
			"application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
	};
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	const response = await fetch(
		`https://ghcr.io/v2/${repository}/manifests/${tag}`,
		{
			method: "HEAD",
			headers,
		},
	);
	if (!response.ok) {
		console.warn(
			`GHCR manifest lookup failed (${response.status}) for ${repository}:${tag}`,
		);
		return null;
	}
	return response.headers.get("docker-content-digest");
};

const listRegistryTags = async (
	registry: string,
	repository: string,
): Promise<RegistryTag[]> => {
	if (registry === "docker.io") {
		return await listDockerHubTags(repository);
	}
	if (registry === "ghcr.io") {
		return await listGhcrTags(repository);
	}
	console.warn(`Unsupported registry for update checks: ${registry}`);
	return [];
};

const getRegistryTagDigest = async (
	registry: string,
	repository: string,
	tag: string,
) => {
	if (registry === "docker.io") {
		const tags = await listDockerHubTags(repository);
		return tags.find((item) => item.name === tag)?.digest || null;
	}
	if (registry === "ghcr.io") {
		return await getGhcrTagDigest(repository, tag);
	}
	return null;
};

export const pullLatestRelease = async (image?: string) => {
	const stream = await docker.pull(image ?? getDokployImage());
	await new Promise((resolve, reject) => {
		docker.modem.followProgress(stream, (err, res) =>
			err ? reject(err) : resolve(res),
		);
	});
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
		const imageParts = parseImageReference(getDokployImageBase());
		const currentImageTag = getDokployImageTag();
		if (isChannelTag(currentImageTag)) {
			const currentDigest = await getServiceImageDigest();
			const latestDigest = await getRegistryTagDigest(
				imageParts.registry,
				imageParts.repository,
				currentImageTag,
			);
			if (!latestDigest) {
				return DEFAULT_UPDATE_DATA;
			}
			return {
				latestVersion: currentImageTag,
				updateAvailable: currentDigest !== latestDigest,
			};
		}

		const allTags = await listRegistryTags(
			imageParts.registry,
			imageParts.repository,
		);
		const versionTags = allTags
			.map((tag) => ({
				tag: tag.name,
				version: semver.clean(tag.name),
			}))
			.filter((entry) => entry.version !== null) as {
			tag: string;
			version: string;
		}[];

		if (versionTags.length === 0) {
			return DEFAULT_UPDATE_DATA;
		}

		versionTags.sort((a, b) => semver.rcompare(a.version, b.version));
		const latestVersion = versionTags[0]?.tag;

		// Use semver to compare versions for stable releases
		const cleanedCurrent = semver.clean(currentVersion);
		const cleanedLatest = latestVersion ? semver.clean(latestVersion) : null;

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

			command = `docker service update --force --image ${buildDokployImage(
				imageTag || currentImageTag,
			)} ${resourceName}`;
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
			const containerPortMapppings = parsedResult[key];
			const protocol = key.split("/")[1];
			const targetPort = Number.parseInt(key.split("/")[0] ?? "0", 10);

			// Take only the first mapping to avoid duplicates (IPv4 and IPv6)
			const firstMapping = containerPortMapppings[0];
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
		const command = `docker ps -a --format '{{.Names}}' | grep -v '^dokploy-traefik$' | while read name; do docker port "$name" 2>/dev/null | grep -q ':${port}' && echo "$name" && break; done || true`;
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		const container = stdout.trim();

		return {
			isInUse: !!container,
			conflictingContainer: container || undefined,
		};
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
	} else if (resourceType === "standalone") {
		await initializeStandaloneTraefik({
			env: input.env,
			additionalPorts: input.additionalPorts,
			serverId: input.serverId,
		});
	} else {
		throw new Error("Traefik resource type not found");
	}
};
