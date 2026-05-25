import { quote } from "shell-quote";
import type { ApplicationNested } from "../builders";
import { createSecretTempFile } from "../process/secrets";

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
			const passwordFile = createSecretTempFile(
				"dokploy-registry-password-",
				"password",
				password,
			);
			command += `
if ! docker login --username ${quote([username])} --password-stdin ${quote([registryUrl || ""])} < ${passwordFile.quotedPath} 2>&1; then
	rm -rf ${passwordFile.quotedDir};
	echo "❌ Login failed";
	exit 1;
fi
rm -rf ${passwordFile.quotedDir};
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
