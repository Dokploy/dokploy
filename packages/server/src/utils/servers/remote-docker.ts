import { docker } from "@dokploy/server/constants";
import { findServerById } from "@dokploy/server/services/server";
import Dockerode from "dockerode";

export const getRemoteDocker = async (
	serverId?: string | null,
	options?: { strict?: boolean },
) => {
	if (!serverId) return docker;
	const server = await findServerById(serverId);
	if (!server.sshKeyId || !server.sshKey?.privateKey) {
		if (options?.strict) {
			throw new Error(
				`Remote Docker initialization failed: Server ${serverId} has no valid SSH key configured. Aborting to prevent local fallback.`,
			);
		}
		return docker;
	}
	const dockerode = new Dockerode({
		host: server.ipAddress,
		port: server.port,
		username: server.username,
		protocol: "ssh",
		// @ts-ignore
		sshOptions: {
			privateKey: server.sshKey?.privateKey,
		},
	});

	return dockerode;
};
