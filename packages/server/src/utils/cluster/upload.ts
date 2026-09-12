import { findAllDeploymentsByApplicationId } from "@dokploy/server/services/deployment";
import {
	findRegistryByIdWithCredentials,
	type Registry,
	safeDockerLoginCommand,
} from "@dokploy/server/services/registry";
import { createRollback } from "@dokploy/server/services/rollbacks";
import { quote } from "shell-quote";
import type { ApplicationNested } from "../builders";

export type RegistryPushTarget = {
	kind: "cluster" | "build" | "rollback";
	registry: Registry;
	imageName: string;
	tag: string;
};

export const collectRegistryPushTargets = async (
	application: ApplicationNested,
): Promise<RegistryPushTarget[]> => {
	const registry = application.registry;
	const buildRegistry = application.buildRegistry;
	const rollbackRegistry = application.rollbackRegistry;
	const { appName } = application;
	const imageName =
		application.sourceType === "docker"
			? application.dockerImage || ""
			: `${appName}:latest`;

	const targets: RegistryPushTarget[] = [];

	if (registry) {
		const r = await findRegistryByIdWithCredentials(registry.registryId);
		const tag = getRegistryTag(r, imageName);
		if (tag) {
			targets.push({ kind: "cluster", registry: r, imageName, tag });
		}
	}
	if (buildRegistry) {
		const r = await findRegistryByIdWithCredentials(buildRegistry.registryId);
		const tag = getRegistryTag(r, imageName);
		if (tag) {
			targets.push({ kind: "build", registry: r, imageName, tag });
		}
	}
	if (rollbackRegistry && application.rollbackActive) {
		const deployment = await findAllDeploymentsByApplicationId(
			application.applicationId,
		);
		if (!deployment || !deployment[0]) {
			throw new Error("Deployment not found");
		}
		const rollback = await createRollback({
			appName: appName,
			deploymentId: deployment[0].deploymentId,
		});
		const r = await findRegistryByIdWithCredentials(
			rollbackRegistry.registryId,
		);
		const tag = getRegistryTag(r, rollback?.image || "");
		if (tag) {
			targets.push({ kind: "rollback", registry: r, imageName, tag });
		}
	}

	return targets;
};

export const registryLoginCommands = (
	targets: RegistryPushTarget[],
): string => {
	return targets
		.map((target) => {
			const loginCmd = safeDockerLoginCommand(
				target.registry.registryUrl,
				target.registry.username,
				target.registry.password,
			);
			return `${loginCmd} || { echo "❌ DockerHub Failed" ; exit 1; }`;
		})
		.join("\n");
};

export const uploadImageRemoteCommand = async (
	application: ApplicationNested,
) => {
	const registry = application.registry;
	const buildRegistry = application.buildRegistry;
	const rollbackRegistry = application.rollbackRegistry;

	if (!registry && !buildRegistry && !rollbackRegistry) {
		throw new Error("No registry found");
	}

	const targets = await collectRegistryPushTargets(application);
	const commands: string[] = [];
	for (const target of targets) {
		if (target.kind === "cluster") {
			commands.push(`echo "📦 [Enabled Registry Swarm]"`);
			commands.push(
				getRegistryCommands(target.registry, target.imageName, target.tag),
			);
		}
		if (target.kind === "build") {
			commands.push(`echo "🔑 [Enabled Build Registry]"`);
			commands.push(
				getRegistryCommands(target.registry, target.imageName, target.tag),
			);
			commands.push(
				`echo "⚠️ INFO: After the build is finished, you need to wait a few seconds for the server to download the image and run the container."`,
			);
			commands.push(
				`echo "📊 Check the Logs tab to see when the container starts running."`,
			);
		}
		if (target.kind === "rollback") {
			commands.push(`echo "🔄 [Enabled Rollback Registry]"`);
			commands.push(
				getRegistryCommands(target.registry, target.imageName, target.tag),
			);
		}
	}
	try {
		return commands.join("\n");
	} catch (error) {
		throw error;
	}
};

/**
 * Extract the repository name from imageName by taking the last part after '/'
 * Examples:
 * - "nginx" -> "nginx"
 * - "nginx:latest" -> "nginx:latest"
 * - "myuser/myrepo" -> "myrepo"
 * - "myuser/myrepo:tag" -> "myrepo:tag"
 * - "docker.io/myuser/myrepo" -> "myrepo"
 */
const extractRepositoryName = (imageName: string): string => {
	const lastSlashIndex = imageName.lastIndexOf("/");

	// If no '/', return the imageName as is
	if (lastSlashIndex === -1) {
		return imageName;
	}

	// Extract everything after the last '/'
	return imageName.substring(lastSlashIndex + 1);
};

export const getRegistryTag = (registry: Registry, imageName: string) => {
	const { registryUrl, imagePrefix, username } = registry;

	// Extract the repository name (last part after '/')
	const repositoryName = extractRepositoryName(imageName);

	// Build the final tag using registry's username/prefix (must be lowercase for valid image refs)
	const targetPrefix = (imagePrefix || username).toLowerCase();
	const finalRegistry = registryUrl || "";

	return finalRegistry
		? `${finalRegistry}/${targetPrefix}/${repositoryName}`
		: `${targetPrefix}/${repositoryName}`;
};

const getRegistryCommands = (
	registry: Registry,
	imageName: string,
	registryTag: string,
): string => {
	const loginCmd = safeDockerLoginCommand(
		registry.registryUrl,
		registry.username,
		registry.password,
	);
	return `
echo ${quote([`📦 [Enabled Registry] Uploading image to '${registry.registryType}' | '${registryTag}'`])} ;
${loginCmd} || {
	echo "❌ DockerHub Failed" ;
	exit 1;
}
echo "✅ Registry Login Success" ;
docker tag ${quote([imageName])} ${quote([registryTag])} || {
	echo "❌ Error tagging image" ;
	exit 1;
}
echo "✅ Image Tagged" ;
docker push ${quote([registryTag])} || {
	echo "❌ Error pushing image" ;
	exit 1;
}
	echo "✅ Image Pushed" ;
`;
};
