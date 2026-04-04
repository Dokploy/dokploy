import { getSafeRegistryLoginCommand } from "../../db/schema/registry";
import { getECRAuthToken } from "../aws/ecr";
import type { ApplicationNested } from "../builders";

export const buildRemoteDocker = async (application: ApplicationNested) => {
	const { registryUrl, dockerImage, username, password, registry } =
		application;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}
		let command = `
echo "Pulling ${dockerImage}";
		`;

		// Handle ECR authentication
		if (registry?.registryType === "awsEcr") {
			const { password: ecrPassword } = await getECRAuthToken({
				awsAccessKeyId: registry.awsAccessKeyId || "",
				awsSecretAccessKey: registry.awsSecretAccessKey || "",
				awsRegion: registry.awsRegion || "",
			});
			const loginCommand = getSafeRegistryLoginCommand({
				registryType: "awsEcr",
				registryUrl: registry.registryUrl,
				ecrAuthPassword: ecrPassword,
			});
			command += `
if ! ${loginCommand} 2>&1; then
	echo "❌ ECR Login failed";
	exit 1;
fi
`;
		} else if (username && password) {
			const loginCommand = getSafeRegistryLoginCommand({
				registryType: registry?.registryType ?? "cloud",
				registryUrl,
				username,
				password,
			});
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
