import { Client } from "ssh2";
import { findServerById } from "../services/server";

export const validateDocker = () => `
  if command_exists docker; then
    echo true
  else
    echo false
  fi
`;

export const validateRClone = () => `
  if command_exists rclone; then
    echo true
  else
    echo false
  fi
`;

export const validateSwarm = () => `
  if docker info --format '{{.Swarm.LocalNodeState}}' | grep -q 'active'; then
    echo true
  else
    echo false
  fi
`;

export const validateNixpacks = () => `
  if command_exists nixpacks; then
	echo true
  else
	echo false
  fi
`;

export const validateBuildpacks = () => `
  if command_exists pack; then
	echo true
  else
	echo false
  fi
`;

export const validateMainDirectory = () => `
  if [ -d "/etc/dokploy" ]; then
	echo true
  else
	echo false
  fi
`;
export const serverValidate = async (serverId: string) => {
	const client = new Client();
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		throw new Error("No SSH Key found");
	}

	return new Promise<string>((resolve, reject) => {
		client
			.once("ready", () => {
				const bashCommand = `
          command_exists() {
            command -v "$@" > /dev/null 2>&1
          }

          isDockerInstalled=$(${validateDocker()})
          isRCloneInstalled=$(${validateRClone()})
          isSwarmInstalled=$(${validateSwarm()})
		  isNixpacksInstalled=$(${validateNixpacks()})
		  isBuildpacksInstalled=$(${validateBuildpacks()})
		  isMainDirectoryInstalled=$(${validateMainDirectory()})

  echo "{\\"isDockerInstalled\\": $isDockerInstalled, \\"isRCloneInstalled\\": $isRCloneInstalled, \\"isSwarmInstalled\\": $isSwarmInstalled, \\"isNixpacksInstalled\\": $isNixpacksInstalled, \\"isBuildpacksInstalled\\": $isBuildpacksInstalled, \\"isMainDirectoryInstalled\\": $isMainDirectoryInstalled}"
        `;
				client.exec(bashCommand, (err, stream) => {
					if (err) {
						reject(err);
						return;
					}
					let output = "";
					stream
						.on("close", () => {
							client.end();
							try {
								const result = JSON.parse(output.trim());
								resolve(result);
							} catch (parseError) {
								reject(
									new Error(
										`Failed to parse output: ${parseError instanceof Error ? parseError.message : parseError}`,
									),
								);
							}
						})
						.on("data", (data: string) => {
							output += data;
						})
						.stderr.on("data", (data) => {});
				});
			})
			.on("error", (err) => {
				client.end();
				if (err.level === "client-authentication") {
					reject(
						new Error(
							`Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`,
						),
					);
				} else {
					reject(new Error(`SSH connection error: ${err.message}`));
				}
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
				timeout: 99999,
			});
	});
};
