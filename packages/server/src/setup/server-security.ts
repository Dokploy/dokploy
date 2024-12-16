import { Client } from "ssh2";
import { findServerById } from "../services/server";

const validateDocker = () => `
  if command_exists docker; then
     echo "$(docker --version | awk '{print $3}' | sed 's/,//') true"
  else
    echo "0.0.0 false"
  fi
`;

const validateRClone = () => `
  if command_exists rclone; then
    echo "$(rclone --version | head -n 1 | awk '{print $2}' | sed 's/^v//') true"
  else
    echo "0.0.0 false"
  fi
`;

const validateSwarm = () => `
  if docker info --format '{{.Swarm.LocalNodeState}}' | grep -q 'active'; then
    echo true
  else
    echo false
  fi
`;

const validateNixpacks = () => `
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

const validateBuildpacks = () => `
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

const validateMainDirectory = () => `
  if [ -d "/etc/dokploy" ]; then
	echo true
  else
	echo false
  fi
`;

const validateDokployNetwork = () => `
  if docker network ls | grep -q 'dokploy-network'; then
	echo true
  else
	echo false
  fi
`;

export const serverSecurity = async (serverId: string) => {
	const client = new Client();
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		throw new Error("No SSH Key found");
	}

	return new Promise<string>((resolve, reject) => {
		client
			.once("ready", () => {
				const bashCommand = `
          set -u;
          check_os() {
            if [ -f /etc/lsb-release ]; then
                echo "ubuntu"
            elif [ -f /etc/debian_version ]; then
                echo "debian"
            else
                echo ""
            fi
          }

		  check_dependencies() {
			echo -e "Checking required dependencies..."
			
			local required_commands=("curl" "jq" "systemctl" "apt-get")
			local missing_commands=()

			for cmd in "\${required_commands[@]}"; do
				if ! command -v "\$cmd" >/dev/null 2>&1; then
					missing_commands+=("\$cmd")
				fi
			done

		if [ \${#missing_commands[@]} -ne 0 ]; then
				echo -e "\${RED}The following required commands are missing:\${NC}"
				for cmd in "\${missing_commands[@]}"; do
					echo "  - \$cmd"
				done
				echo
				echo -e "\${YELLOW}Please install these commands before running this script.\${NC}"
				exit 1
		fi

			echo -e "All required dependencies are installed\n"
			return 0
		}


          os=$(check_os)
          
          if [ -z "$os" ]; then
              echo "This script only supports Ubuntu/Debian systems. Exiting."
              echo "Please ensure you're running this script on a supported operating system."
              exit 1
          fi

          echo "Detected supported OS: $os"
          echo "Installing requirements for OS: $os"
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
								// const result = JSON.parse(output.trim());
								console.log("Output:", output);
								resolve(output.trim());
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
			});
	});
};
