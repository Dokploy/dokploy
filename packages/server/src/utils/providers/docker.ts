import { safeDockerLoginCommand } from "@dokploy/server/services/registry";
import type { ApplicationNested } from "../builders";

export const buildRemoteDocker = async (application: ApplicationNested) => {
	const { registryUrl, dockerImage, username, password } = application;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}
		let command = `
echo "Pulling ${dockerImage}";		
		`;

		if (username && password) {
			const loginCommand = safeDockerLoginCommand(
				registryUrl || "",
				username,
				password,
			);

			command += `
if ! ${loginCommand} 2>&1; then
	echo "❌ Login failed";
	exit 1;
fi
`;
		}

		command += `
docker pull ${dockerImage} 2>&1 || { 
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
