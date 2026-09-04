import {
	findRegistryByIdWithCredentials,
	safeDockerLoginCommand,
} from "@dokploy/server/services/registry";
import { quote } from "shell-quote";
import type { ApplicationNested } from "../builders";

export const buildRemoteDocker = async (application: ApplicationNested) => {
	const { registry, dockerImage, username, password, registryUrl } =
		application;

	const storedRegistry = registry
		? await findRegistryByIdWithCredentials(registry.registryId)
		: null;

	const loginUsername = storedRegistry?.username || username;
	const loginPassword = storedRegistry?.password || password;
	const loginRegistryUrl = storedRegistry?.registryUrl || registryUrl;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}

		let command = `
echo ${quote([`Pulling ${dockerImage}`])};
		`;

		if (loginUsername && loginPassword) {
			command += `
if ! ${safeDockerLoginCommand(loginRegistryUrl || "", loginUsername, loginPassword)} 2>&1; then
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
