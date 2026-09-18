import { safeDockerLoginCommand } from "@dokploy/server/services/registry";
import { quote } from "shell-quote";
import type { ApplicationNested } from "../builders";
import {
	findRegistryMismatch,
	registryAuthAddress,
} from "../docker/registry-reference";

export const buildRemoteDocker = async (application: ApplicationNested) => {
	const { registryUrl, dockerImage, username, password } = application;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}

		// `docker pull` receives the image verbatim, so a reference with no
		// registry host is fetched from Docker Hub however the Registry URL is
		// configured. Fail with the correction instead of letting the daemon
		// answer "pull access denied" for a registry it was never asked about.
		const mismatch = findRegistryMismatch(dockerImage, registryUrl);
		if (mismatch) {
			throw new Error(mismatch);
		}

		let command = `
echo ${quote([`Pulling ${dockerImage}`])};
		`;

		if (username && password) {
			command += `
if ! ${safeDockerLoginCommand(registryAuthAddress(registryUrl), username, password)} 2>&1; then
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
