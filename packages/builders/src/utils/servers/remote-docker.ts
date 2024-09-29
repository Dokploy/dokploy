import { findServerById } from "@/server/services/server";
import { docker } from "@/server/constants";
import Dockerode from "dockerode";
import { readSSHKey } from "../filesystem/ssh";

export const getRemoteDocker = async (serverId?: string | null) => {
	if (!serverId) return docker;
	const server = await findServerById(serverId);
	if (!server.sshKeyId) return docker;
	const keys = await readSSHKey(server.sshKeyId);
	const dockerode = new Dockerode({
		host: server.ipAddress,
		port: server.port,
		username: server.username,
		protocol: "ssh",
		// @ts-ignore
		sshOptions: {
			privateKey: keys.privateKey,
		},
	});

	return dockerode;
};
