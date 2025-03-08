import { Client } from "ssh2";
import { findServerById } from "../services/server";

export const validateDocker = () => `
  if command_exists docker; then
     echo "$(docker --version | awk '{print $3}' | sed 's/,//') true"
  else
    echo "0.0.0 false"
  fi
`;

export const validateRClone = () => `
  if command_exists rclone; then
    echo "$(rclone --version | head -n 1 | awk '{print $2}' | sed 's/^v//') true"
  else
    echo "0.0.0 false"
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
	version=$(nixpacks --version | awk '{print $2}')
    if [ -n "$version" ]; then
      echo "$version true"
    else
      echo "0.0.0 false"
    fi
  else
    echo "0.0.0 false"
  fi
`;

export const validateRailpack = () => `
  if command_exists railpack; then
    version=$(railpack --version | awk '{print $3}')
    if [ -n "$version" ]; then
      echo "$version true"
    else
      echo "0.0.0 false"
    fi
  else
    echo "0.0.0 false"
  fi
`;
export const validateBuildpacks = () => `
  if command_exists pack; then
    version=$(pack --version | awk '{print $1}')
    if [ -n "$version" ]; then
      echo "$version true"
    else
      echo "0.0.0 false"
    fi
  else
    echo "0.0.0 false"
  fi
`;

export const validateMainDirectory = () => `
  if [ -d "/etc/dokploy" ]; then
	echo true
  else
	echo false
  fi
`;

export const validateDokployNetwork = () => `
  if docker network ls | grep -q 'dokploy-network'; then
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

          dockerVersionEnabled=$(${validateDocker()})
          rcloneVersionEnabled=$(${validateRClone()})
          nixpacksVersionEnabled=$(${validateNixpacks()})
          buildpacksVersionEnabled=$(${validateBuildpacks()})
          railpackVersionEnabled=$(${validateRailpack()})
          dockerVersion=$(echo $dockerVersionEnabled | awk '{print $1}')
          dockerEnabled=$(echo $dockerVersionEnabled | awk '{print $2}')

          rcloneVersion=$(echo $rcloneVersionEnabled | awk '{print $1}')
          rcloneEnabled=$(echo $rcloneVersionEnabled | awk '{print $2}')

          nixpacksVersion=$(echo $nixpacksVersionEnabled | awk '{print $1}')
          nixpacksEnabled=$(echo $nixpacksVersionEnabled | awk '{print $2}')

          railpackVersion=$(echo $railpackVersionEnabled | awk '{print $1}')
          railpackEnabled=$(echo $railpackVersionEnabled | awk '{print $2}')

          buildpacksVersion=$(echo $buildpacksVersionEnabled | awk '{print $1}')
          buildpacksEnabled=$(echo $buildpacksVersionEnabled | awk '{print $2}')

          isDokployNetworkInstalled=$(${validateDokployNetwork()})
          isSwarmInstalled=$(${validateSwarm()})
          isMainDirectoryInstalled=$(${validateMainDirectory()})

  echo "{\\"docker\\": {\\"version\\": \\"$dockerVersion\\", \\"enabled\\": $dockerEnabled}, \\"rclone\\": {\\"version\\": \\"$rcloneVersion\\", \\"enabled\\": $rcloneEnabled}, \\"nixpacks\\": {\\"version\\": \\"$nixpacksVersion\\", \\"enabled\\": $nixpacksEnabled}, \\"buildpacks\\": {\\"version\\": \\"$buildpacksVersion\\", \\"enabled\\": $buildpacksEnabled}, \\"railpack\\": {\\"version\\": \\"$railpackVersion\\", \\"enabled\\": $railpackEnabled}, \\"isDokployNetworkInstalled\\": $isDokployNetworkInstalled, \\"isSwarmInstalled\\": $isSwarmInstalled, \\"isMainDirectoryInstalled\\": $isMainDirectoryInstalled}"
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
						.stderr.on("data", (_data) => {});
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
			});
	});
};
