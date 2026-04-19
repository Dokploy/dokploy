import { safeDockerLoginCommand } from "../../services/registry";
import type { ApplicationNested } from "../builders";

export const buildRemoteDocker = async (application: ApplicationNested) => {
	const { registryUrl, dockerImage, username, password, registry } = application;

	// Prefer application-level credentials; fall back to linked registry credentials
	const authUser = username ?? registry?.username ?? null;
	const authPass = password ?? registry?.password ?? null;
	const authUrl = registryUrl ?? registry?.registryUrl ?? null;

	if (!dockerImage) {
		throw new Error("Docker image not found");
	}

	let command = `\necho "Pulling ${dockerImage}";\n`;

	if (authUser && authPass) {
		command += `\n${safeDockerLoginCommand(authUrl ?? undefined, authUser, authPass)}\n`;
	}

	command += `
docker pull ${dockerImage} 2>&1 || {
  echo "❌ Pulling image failed";
  exit 1;
}

echo "✅ Pulling image completed.";
`;
	return command;
};
