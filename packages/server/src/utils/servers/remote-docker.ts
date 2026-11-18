import { docker } from "@dokploy/server/constants";
import { findServerById } from "@dokploy/server/services/server";
import Dockerode from "dockerode";
import { sshKeepalive } from "../process/execAsync";

export const getRemoteDocker = async (serverId?: string | null) => {
	if (!serverId) return docker;
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		throw new Error("No SSH key available for this server");
	}
	const dockerode = new Dockerode({
		host: server.ipAddress,
		port: server.port,
		username: server.username,
		protocol: "ssh",
		// @ts-expect-error
		sshOptions: {
			privateKey: server.sshKey?.privateKey,
			...sshKeepalive,
		},
	});

	return dockerode;
};
