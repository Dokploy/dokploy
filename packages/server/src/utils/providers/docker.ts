import type { ApplicationNested } from "../builders";

export const buildRemoteDocker = async (application: ApplicationNested) => {
	const { registry, dockerImage, username, password, registryUrl } =
		application;

	const loginUsername = registry?.username || username;
	const loginPassword = registry?.password || password;
	const loginRegistryUrl = registry?.registryUrl || registryUrl;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}

		let pullImage = dockerImage;
		if (loginRegistryUrl && !dockerImage.startsWith(loginRegistryUrl)) {
			pullImage = loginUsername
				? `${loginRegistryUrl}/${loginUsername}/${dockerImage}`.toLowerCase()
				: `${loginRegistryUrl}/${dockerImage}`.toLowerCase();
		}

		let command = `
echo "Pulling ${pullImage}";
		`;

		if (loginUsername && loginPassword) {
			command += `
if ! echo "${loginPassword}" | docker login --username "${loginUsername}" --password-stdin "${loginRegistryUrl || ""}" 2>&1; then
	echo "❌ Login failed";
	exit 1;
fi
`;
		}

		command += `
docker pull ${pullImage} 2>&1 || {
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
