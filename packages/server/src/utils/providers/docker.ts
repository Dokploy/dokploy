import { safeDockerLoginCommand } from "@dokploy/server/services/registry";
import type { ApplicationNested } from "../builders";
import { buildDockerPullCommand } from "../docker/commands";
import { buildProviderEchoCommand } from "./commands";

export const buildRemoteDocker = async (application: ApplicationNested) => {
	const { registryUrl, dockerImage, username, password } = application;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}
		let command = `
${buildProviderEchoCommand(`Pulling ${dockerImage}`)}
	`;

		if (username && password) {
			command += `
if ! ${safeDockerLoginCommand(registryUrl || "", username, password)} 2>&1; then
	echo "❌ Login failed";
	exit 1;
fi
`;
		}

		command += `
${buildDockerPullCommand(dockerImage)} 2>&1 || {
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
