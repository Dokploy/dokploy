import { findRegistryByIdWithCredentials } from "@dokploy/server/services/registry";
import { getECRAuthToken } from "../aws/ecr";
import { runDockerLogin } from "../process/dockerLogin";
import { quote } from "shell-quote";
import type { ApplicationNested } from "../builders";

export const buildRemoteDocker = async (
	application: ApplicationNested,
	serverId: string | null | undefined,
) => {
	const { registryUrl, dockerImage, username, password, registry } =
		application;

	try {
		if (!dockerImage) {
			throw new Error("Docker image not found");
		}
		let command = `
echo ${quote([`Pulling ${dockerImage}`])};
		`;

		// Handle ECR authentication
		if (registry?.registryType === "awsEcr") {
			const { password: ecrPassword } = await getECRAuthToken({
				awsAccessKeyId: registry.awsAccessKeyId || "",
				awsSecretAccessKey: registry.awsSecretAccessKey || "",
				awsRegion: registry.awsRegion || "",
			});
			// Logged in ahead of the script, on the host that will run it: the
			// token travels on stdin, never in the script's command line.
			await runDockerLogin(
				{
					registryType: "awsEcr",
					registryUrl: registry.registryUrl,
					ecrAuthPassword: ecrPassword,
				},
				serverId,
			);
		} else if (registry) {
			// Standard registry attached to the application: pull with its
			// stored credentials (loaded on demand because the fork excludes
			// registry passwords from relational queries).
			const r = await findRegistryByIdWithCredentials(registry.registryId);
			if (r.username && r.password) {
				await runDockerLogin(
					{
						registryType: registry.registryType ?? "cloud",
						registryUrl: r.registryUrl,
						username: r.username,
						password: r.password,
					},
					serverId,
				);
			}
		} else if (username && password) {
			await runDockerLogin(
				{ registryType: "cloud", registryUrl, username, password },
				serverId,
			);
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
