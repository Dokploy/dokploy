import { findAllDeploymentsByApplicationId } from "@dokploy/server/services/deployment";
import type { Registry } from "@dokploy/server/services/registry";
import { createRollback } from "@dokploy/server/services/rollbacks";
import type { ApplicationNested } from "../builders";

export const uploadImageRemoteCommand = async (
	application: ApplicationNested,
	commitHash?: string,
	deploymentId?: string,
) => {
	const registry = application.registry;
	const buildRegistry = application.buildRegistry;
	const rollbackRegistry = application.rollbackRegistry;

	if (!registry && !buildRegistry && !rollbackRegistry) {
		throw new Error("No registry found");
	}

	const { appName } = application;
	const imageName =
		application.sourceType === "docker"
			? application.dockerImage || ""
			: `${appName}:latest`;

	const commands: string[] = [];
	if (registry) {
		const registryTag = getRegistryTag(registry, imageName);
		if (registryTag) {
			commands.push(`echo "📦 [Enabled Registry Swarm]"`);
			commands.push(getRegistryCommands(registry, imageName, registryTag));
			if (commitHash && isValidCommitHash(commitHash)) {
				const commitRegistryTag = getRegistryTag(
					registry,
					`${appName}:${commitHash.toLowerCase()}`,
				);
				commands.push(
					getRegistryCommands(registry, imageName, commitRegistryTag),
				);
			}
		}
	}
	if (buildRegistry) {
		const buildRegistryTag = getRegistryTag(buildRegistry, imageName);
		if (buildRegistryTag) {
			commands.push(`echo "🔑 [Enabled Build Registry]"`);
			commands.push(
				getRegistryCommands(buildRegistry, imageName, buildRegistryTag),
			);
			commands.push(
				`echo "⚠️ INFO: After the build is finished, you need to wait a few seconds for the server to download the image and run the container."`,
			);
			commands.push(
				`echo "📊 Check the Logs tab to see when the container starts running."`,
			);
			if (commitHash && isValidCommitHash(commitHash)) {
				const commitBuildRegistryTag = getRegistryTag(
					buildRegistry,
					`${appName}:${commitHash.toLowerCase()}`,
				);
				commands.push(
					getRegistryCommands(buildRegistry, imageName, commitBuildRegistryTag),
				);
			}
		}
	}

	if (
		application.sourceType !== "docker" &&
		commitHash &&
		isValidCommitHash(commitHash)
	) {
		commands.push(
			`docker tag ${imageName} ${application.appName}:${commitHash.toLowerCase()} || true`,
		);
	}

	if (rollbackRegistry && application.rollbackActive) {
		let rollbackDeploymentId = deploymentId;
		if (!rollbackDeploymentId) {
			const deployment = await findAllDeploymentsByApplicationId(
				application.applicationId,
			);
			rollbackDeploymentId = deployment?.[0]?.deploymentId;
		}
		if (!rollbackDeploymentId) {
			throw new Error("Deployment not found");
		}
		const rollback = await createRollback({
			appName: appName,
			deploymentId: rollbackDeploymentId,
		});

		const rollbackRegistryTag = getRegistryTag(
			rollbackRegistry,
			rollback?.image || "",
		);
		if (rollbackRegistryTag) {
			commands.push(`echo "🔄 [Enabled Rollback Registry]"`);
			commands.push(
				getRegistryCommands(rollbackRegistry, imageName, rollbackRegistryTag),
			);
		}
	}

	try {
		return commands.join("\n");
	} catch (error) {
		throw error;
	}
};

export const createRollbackForDeploymentIfNeeded = async (
	application: ApplicationNested,
	deploymentId: string,
) => {
	if (!application.rollbackRegistry || !application.rollbackActive) {
		return;
	}

	await createRollback({
		appName: application.appName,
		deploymentId,
	});
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

	// Build the final tag using registry's username/prefix
	const targetPrefix = imagePrefix || username;
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
	return `
echo "📦 [Enabled Registry] Uploading image to '${registry.registryType}' | '${registryTag}'" ;
echo "${registry.password}" | docker login ${registry.registryUrl} -u '${registry.username}' --password-stdin || { 
	echo "❌ DockerHub Failed" ;
	exit 1;
}
echo "✅ Registry Login Success" ;
docker tag ${imageName} ${registryTag} || { 
	echo "❌ Error tagging image" ;
	exit 1;
}
echo "✅ Image Tagged" ;
docker push ${registryTag} || { 
	echo "❌ Error pushing image" ;
	exit 1;
}
	echo "✅ Image Pushed" ;
`;
};

const isValidCommitHash = (commitHash: string) =>
	/^[a-fA-F0-9]{7,40}$/.test(commitHash);

export const getReuseCommitImageCommand = (
	application: ApplicationNested,
	commitHash: string,
) => {
	if (!isValidCommitHash(commitHash) || application.sourceType === "docker") {
		return "echo 'DOKPLOY_COMMIT_IMAGE_REUSED=0';";
	}

	const normalizedCommitHash = commitHash.toLowerCase();
	const localLatestImage = `${application.appName}:latest`;
	const localCommitImage = `${application.appName}:${normalizedCommitHash}`;
	const registries = [application.registry, application.buildRegistry].filter(
		(registry): registry is Registry => Boolean(registry),
	);

	const pullFromRegistries = registries
		.map((registry, index) => {
			const commitTag = getRegistryTag(registry, localCommitImage);
			return [
				`if [ "$reused_image" -eq 0 ]; then`,
				`\techo "${registry.password}" | docker login ${registry.registryUrl} -u '${registry.username}' --password-stdin >/dev/null 2>&1 || true;`,
				`\tif docker pull ${commitTag} >/dev/null 2>&1; then`,
				`\t\tdocker tag ${commitTag} ${localLatestImage} >/dev/null 2>&1 && reused_image=1;`,
				`\t\techo "✅ Reused image from registry source ${index + 1}";`,
				"\tfi;",
				"fi;",
			].join(" ");
		})
		.join(" ");

	const syncLatestToRuntimeRegistry = application.registry
		? [
				`if [ "$reused_image" -eq 1 ]; then`,
				`\techo "${application.registry.password}" | docker login ${application.registry.registryUrl} -u '${application.registry.username}' --password-stdin >/dev/null 2>&1 || true;`,
				`\tdocker tag ${localLatestImage} ${getRegistryTag(application.registry, localLatestImage)} >/dev/null 2>&1;`,
				`\tdocker push ${getRegistryTag(application.registry, localLatestImage)} >/dev/null 2>&1 || true;`,
				"fi;",
			].join(" ")
		: "";

	return [
		"set +e;",
		"reused_image=0;",
		`echo \"🔎 Checking image cache for commit ${normalizedCommitHash}\";`,
		`if docker image inspect ${localCommitImage} >/dev/null 2>&1; then`,
		`\tdocker tag ${localCommitImage} ${localLatestImage} >/dev/null 2>&1 && reused_image=1;`,
		"fi;",
		pullFromRegistries || 'echo "No registry configured for commit reuse";',
		syncLatestToRuntimeRegistry,
		'echo "DOKPLOY_COMMIT_IMAGE_REUSED=$reused_image";',
		"set -e;",
	].join(" ");
};
