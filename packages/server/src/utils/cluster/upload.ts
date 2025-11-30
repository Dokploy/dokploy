import type { Registry } from "@dokploy/server/services/registry";
import type { ApplicationNested } from "../builders";

export const uploadImageRemoteCommand = (application: ApplicationNested) => {
	const registry = application.registry;
	const buildRegistry = application.buildRegistry;

	if (!registry && !buildRegistry) {
		throw new Error("No registry found");
	}

	const { appName } = application;
	const imageName = `${appName}:latest`;

	const commands: string[] = [];
	if (registry) {
		const registryTag = getRegistryTag(registry, imageName);
		if (registryTag) {
			commands.push(`echo "📦 [Enabled Registry Swarm]"`);
			commands.push(getRegistryCommands(registry, imageName, registryTag));
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
		}
	}
	try {
		return commands.join("\n");
	} catch (error) {
		throw error;
	}
};
const getRegistryTag = (registry: Registry | null, imageName: string) => {
	if (!registry) {
		return null;
	}
	const { registryUrl, imagePrefix, username } = registry;
	return imagePrefix
		? `${registryUrl ? `${registryUrl}/` : ""}${imagePrefix}/${imageName}`
		: `${registryUrl ? `${registryUrl}/` : ""}${username}/${imageName}`;
};

const getRegistryCommands = (
	registry: Registry,
	imageName: string,
	registryTag: string,
): string => {
	return `
echo "📦 [Enabled Registry] Uploading image to '${registry.registryType}' | '${registryTag}'" ;
echo "${registry.password}" | docker login ${registry.registryUrl} -u ${registry.username} --password-stdin || { 
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
