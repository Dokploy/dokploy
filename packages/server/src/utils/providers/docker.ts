import {
	findRegistryByIdWithCredentials,
	safeDockerLoginCommand,
} from "@dokploy/server/services/registry";
import { quote } from "shell-quote";
import type { ApplicationNested } from "../builders";

/**
 * Credentials that pull a Docker-source image. The app's own username and
 * password win; without them, the registry selected in the Docker provider
 * is used. Returns undefined when neither is set (anonymous pull).
 */
export const getDockerSourceCredentials = async (
	application: Pick<
		ApplicationNested,
		"username" | "password" | "registryUrl" | "dockerRegistryId"
	>,
) => {
	const { username, password, registryUrl, dockerRegistryId } = application;
	if (username && password) {
		return { username, password, registryUrl: registryUrl || "" };
	}
	if (dockerRegistryId) {
		const r = await findRegistryByIdWithCredentials(dockerRegistryId);
		return {
			username: r.username,
			password: r.password,
			registryUrl: r.registryUrl,
		};
	}
	return undefined;
};

export const buildRemoteDocker = async (application: ApplicationNested) => {
	const { dockerImage } = application;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}
		let command = `
echo ${quote([`Pulling ${dockerImage}`])};
		`;

		const credentials = await getDockerSourceCredentials(application);
		if (credentials) {
			command += `
if ! ${safeDockerLoginCommand(credentials.registryUrl, credentials.username, credentials.password)} 2>&1; then
	echo "❌ Login failed";
	exit 1;
fi
`;
		}

		command += `
docker pull ${quote([dockerImage])} 2>&1 || {
  echo "❌ Pulling image failed";
  exit 1;
}

echo "✅ Pulling image completed.";
`;
		return command;
	} catch (error) {
		throw error;
	}
};
