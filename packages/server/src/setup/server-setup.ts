import { createWriteStream } from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	createServerDeployment,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findServerById } from "@dokploy/server/services/server";
import {
	getDefaultMiddlewares,
	getDefaultServerTraefikConfig,
} from "@dokploy/server/setup/traefik-setup";
import { Client } from "ssh2";
import { recreateDirectory } from "../utils/filesystem/directory";

import slug from "slugify";

export const slugify = (text: string | undefined) => {
	if (!text) {
		return "";
	}

	const cleanedText = text.trim().replace(/[^a-zA-Z0-9\s]/g, "");

	return slug(cleanedText, {
		lower: true,
		trim: true,
		strict: true,
	});
};

export const serverSetup = async (serverId: string) => {
	const server = await findServerById(serverId);
	const { LOGS_PATH } = paths();

	const slugifyName = slugify(`server ${server.name}`);

	const fullPath = path.join(LOGS_PATH, slugifyName);

	await recreateDirectory(fullPath);

	const deployment = await createServerDeployment({
		serverId: server.serverId,
		title: "Setup Server",
		description: "Setup Server",
	});

	const writeStream = createWriteStream(deployment.logPath, { flags: "a" });
	try {
		writeStream.write("\nInstalling Server Dependencies: ✅\n");
		await installRequirements(serverId, deployment.logPath);
		writeStream.close();

		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (err) {
		console.log(err);
		await updateDeploymentStatus(deployment.deploymentId, "error");
		writeStream.write(err);
		writeStream.close();
	}
};

const installRequirements = async (serverId: string, logPath: string) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const client = new Client();
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		writeStream.write("❌ No SSH Key found");
		writeStream.close();
		throw new Error("No SSH Key found");
	}

	return new Promise<void>((resolve, reject) => {
		client
			.once("ready", () => {
				const bashCommand = `
				set -e;
				# Thanks to coolify <3

				DOCKER_VERSION=27.0.3
				OS_TYPE=$(grep -w "ID" /etc/os-release | cut -d "=" -f 2 | tr -d '"')
				SYS_ARCH=$(uname -m)
				CURRENT_USER=$USER

				echo "Installing requirements for: OS: $OS_TYPE"
				if [ $EUID != 0 ]; then
					echo "Please run this script as root or with sudo ❌" 
					exit
				fi
				
				# Check if the OS is manjaro, if so, change it to arch
				if [ "$OS_TYPE" = "manjaro" ] || [ "$OS_TYPE" = "manjaro-arm" ]; then
					OS_TYPE="arch"
				fi

				# Check if the OS is Asahi Linux, if so, change it to fedora
				if [ "$OS_TYPE" = "fedora-asahi-remix" ]; then
					OS_TYPE="fedora"
				fi

				# Check if the OS is popOS, if so, change it to ubuntu
				if [ "$OS_TYPE" = "pop" ]; then
					OS_TYPE="ubuntu"
				fi

				# Check if the OS is linuxmint, if so, change it to ubuntu
				if [ "$OS_TYPE" = "linuxmint" ]; then
					OS_TYPE="ubuntu"
				fi

				#Check if the OS is zorin, if so, change it to ubuntu
				if [ "$OS_TYPE" = "zorin" ]; then
					OS_TYPE="ubuntu"
				fi

				if [ "$OS_TYPE" = "arch" ] || [ "$OS_TYPE" = "archarm" ]; then
					OS_VERSION="rolling"
				else
					OS_VERSION=$(grep -w "VERSION_ID" /etc/os-release | cut -d "=" -f 2 | tr -d '"')
				fi

				case "$OS_TYPE" in
				arch | ubuntu | debian | raspbian | centos | fedora | rhel | ol | rocky | sles | opensuse-leap | opensuse-tumbleweed | almalinux | amzn | alpine) ;;
				*)
					echo "This script only supports Debian, Redhat, Arch Linux, Alpine Linux, or SLES based operating systems for now."
					exit
					;;
				esac

				echo -e "---------------------------------------------"
				echo "| CPU Architecture  | $SYS_ARCH"
				echo "| Operating System  | $OS_TYPE $OS_VERSION"
				echo "| Docker            | $DOCKER_VERSION"
				echo -e "---------------------------------------------\n"
				echo -e "1. Installing required packages (curl, wget, git, jq, openssl). "

				command_exists() {
					command -v "$@" > /dev/null 2>&1
				}

				${installUtilities()}

				echo -e "2. Validating ports. "
				${validatePorts()}

				

				echo -e "3. Installing RClone. "
				${installRClone()}

				echo -e "4. Installing Docker. "
				${installDocker()}

				echo -e "5. Setting up Docker Swarm"
				${setupSwarm()}

				echo -e "6. Setting up Network"
				${setupNetwork()}

				echo -e "7. Setting up Directories"
				${setupMainDirectory()}
				${setupDirectories()}

				echo -e "8. Setting up Traefik"
				${createTraefikConfig()}

				echo -e "9. Setting up Middlewares"
				${createDefaultMiddlewares()}

				echo -e "10. Setting up Traefik Instance"
				${createTraefikInstance()}

				echo -e "11. Installing Nixpacks"
				${installNixpacks()}

				echo -e "12. Installing Buildpacks"
				${installBuildpacks()}
				`;
				client.exec(bashCommand, (err, stream) => {
					if (err) {
						writeStream.write(err);
						reject(err);
						return;
					}
					stream
						.on("close", () => {
							client.end();
							resolve();
						})
						.on("data", (data: string) => {
							writeStream.write(data.toString());
						})
						.stderr.on("data", (data) => {
							writeStream.write(data.toString());
						});
				});
			})
			.on("error", (err) => {
				client.end();
				if (err.level === "client-authentication") {
					writeStream.write(
						`Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`,
					);
					reject(
						new Error(
							`Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`,
						),
					);
				} else {
					writeStream.write(
						`SSH connection error: ${err.message} ${err.level}`,
					);
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

const setupDirectories = () => {
	const { SSH_PATH } = paths(true);
	const directories = Object.values(paths(true));

	const createDirsCommand = directories
		.map((dir) => `mkdir -p "${dir}"`)
		.join(" && ");
	const chmodCommand = `chmod 700 "${SSH_PATH}"`;

	const command = `
	${createDirsCommand}
	${chmodCommand}
	`;

	return command;
};

const setupMainDirectory = () => `
	# Check if the /etc/dokploy directory exists
	if [ -d /etc/dokploy ]; then
		echo "/etc/dokploy already exists ✅"
	else
		# Create the /etc/dokploy directory
		mkdir -p /etc/dokploy
		chmod 777 /etc/dokploy
		
		echo "Directory /etc/dokploy created ✅"
	fi
`;

export const setupSwarm = () => `
		# Check if the node is already part of a Docker Swarm
		if docker info | grep -q 'Swarm: active'; then
			echo "Already part of a Docker Swarm ✅"
		else
			# Get IP address
			get_ip() {
				# Try to get IPv4
				local ipv4=\$(curl -4s https://ifconfig.io 2>/dev/null)

				if [ -n "\$ipv4" ]; then
					echo "\$ipv4"
				else
					# Try to get IPv6
					local ipv6=\$(curl -6s https://ifconfig.io 2>/dev/null)
					if [ -n "\$ipv6" ]; then
						echo "\$ipv6"
					fi
				fi
			}
			advertise_addr=\$(get_ip)

			# Initialize Docker Swarm
			docker swarm init --advertise-addr \$advertise_addr
			echo "Swarm initialized ✅"
		fi
	`;

const setupNetwork = () => `
	# Check if the dokploy-network already exists
	if docker network ls | grep -q 'dokploy-network'; then
		echo "Network dokploy-network already exists ✅"
	else
		# Create the dokploy-network if it doesn't exist
		if docker network create --driver overlay --attachable dokploy-network; then
			echo "Network created ✅"
		else
			echo "Failed to create dokploy-network ❌" >&2
			exit 1
		fi
	fi
`;

const validatePorts = () => `
	# check if something is running on port 80
	if ss -tulnp | grep ':80 ' >/dev/null; then
		echo "Something is already running on port 80" >&2
	fi

	# check if something is running on port 443
	if ss -tulnp | grep ':443 ' >/dev/null; then
		echo "Something is already running on port 443" >&2
	fi
`;

const installUtilities = () => `

	case "$OS_TYPE" in
	arch)
		pacman -Sy --noconfirm --needed curl wget git jq openssl >/dev/null || true
		;;
	alpine)
		sed -i '/^#.*\/community/s/^#//' /etc/apk/repositories
		apk update >/dev/null
		apk add curl wget git jq openssl >/dev/null
		;;
	ubuntu | debian | raspbian)
		DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null
		DEBIAN_FRONTEND=noninteractive apt-get install -y curl wget git jq openssl >/dev/null
		;;
	centos | fedora | rhel | ol | rocky | almalinux | amzn)
		if [ "$OS_TYPE" = "amzn" ]; then
			dnf install -y wget git jq openssl >/dev/null
		else
			if ! command -v dnf >/dev/null; then
				yum install -y dnf >/dev/null
			fi
			if ! command -v curl >/dev/null; then
				dnf install -y curl >/dev/null
			fi
			dnf install -y wget git jq openssl unzip >/dev/null
		fi
		;;
	sles | opensuse-leap | opensuse-tumbleweed)
		zypper refresh >/dev/null
		zypper install -y curl wget git jq openssl >/dev/null
		;;
	*)
		echo "This script only supports Debian, Redhat, Arch Linux, or SLES based operating systems for now."
		exit
		;;
	esac
`;

const installDocker = () => `

# Detect if docker is installed via snap
if [ -x "$(command -v snap)" ]; then
    SNAP_DOCKER_INSTALLED=$(snap list docker >/dev/null 2>&1 && echo "true" || echo "false")
    if [ "$SNAP_DOCKER_INSTALLED" = "true" ]; then
        echo " - Docker is installed via snap."
        echo "   Please note that Dokploy does not support Docker installed via snap."
        echo "   Please remove Docker with snap (snap remove docker) and reexecute this script."
        exit 1
    fi
fi

echo -e "3. Check Docker Installation. "
if ! [ -x "$(command -v docker)" ]; then
    echo " - Docker is not installed. Installing Docker. It may take a while."
    case "$OS_TYPE" in
        "almalinux")
            dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo >/dev/null 2>&1
            dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Docker could not be installed automatically. Please visit https://docs.docker.com/engine/install/ and install Docker manually to continue."
                exit 1
            fi
            systemctl start docker >/dev/null 2>&1
            systemctl enable docker >/dev/null 2>&1
            ;;
        "alpine")
            apk add docker docker-cli-compose >/dev/null 2>&1
            rc-update add docker default >/dev/null 2>&1
            service docker start >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Failed to install Docker with apk. Try to install it manually."
                echo "   Please visit https://wiki.alpinelinux.org/wiki/Docker for more information."
                exit 1
            fi
            ;;
        "arch")
            pacman -Sy docker docker-compose --noconfirm >/dev/null 2>&1
            systemctl enable docker.service >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Failed to install Docker with pacman. Try to install it manually."
                echo "   Please visit https://wiki.archlinux.org/title/docker for more information."
                exit 1
            fi
            ;;
        "amzn")
            dnf install docker -y >/dev/null 2>&1
            DOCKER_CONFIG=/usr/local/lib/docker
            mkdir -p $DOCKER_CONFIG/cli-plugins >/dev/null 2>&1
            curl -sL https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m) -o $DOCKER_CONFIG/cli-plugins/docker-compose >/dev/null 2>&1
            chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose >/dev/null 2>&1
            systemctl start docker >/dev/null 2>&1
            systemctl enable docker >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Failed to install Docker with dnf. Try to install it manually."
                echo "   Please visit https://www.cyberciti.biz/faq/how-to-install-docker-on-amazon-linux-2/ for more information."
                exit 1
            fi
            ;;
        "fedora")
            if [ -x "$(command -v dnf5)" ]; then
                # dnf5 is available
                dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo --overwrite >/dev/null 2>&1
            else
                # dnf5 is not available, use dnf
                dnf config-manager --add-repo=https://download.docker.com/linux/fedora/docker-ce.repo >/dev/null 2>&1
            fi
            dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Docker could not be installed automatically. Please visit https://docs.docker.com/engine/install/ and install Docker manually to continue."
                exit 1
            fi
            systemctl start docker >/dev/null 2>&1
            systemctl enable docker >/dev/null 2>&1
            ;;
        *)
            if [ "$OS_TYPE" = "ubuntu" ] && [ "$OS_VERSION" = "24.10" ]; then
                echo "Docker automated installation is not supported on Ubuntu 24.10 (non-LTS release)."
                    echo "Please install Docker manually."
                exit 1
            fi
            curl -s https://releases.rancher.com/install-docker/$DOCKER_VERSION.sh | sh 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                curl -s https://get.docker.com | sh -s -- --version $DOCKER_VERSION 2>&1
                if ! [ -x "$(command -v docker)" ]; then
                    echo " - Docker installation failed."
                    echo "   Maybe your OS is not supported?"
                    echo " - Please visit https://docs.docker.com/engine/install/ and install Docker manually to continue."
                    exit 1
                fi
            fi
			if [ "$OS_TYPE" = "rocky" ]; then
				systemctl start docker >/dev/null 2>&1
				systemctl enable docker >/dev/null 2>&1
			fi

			if [ "$OS_TYPE" = "centos" ]; then
				systemctl start docker >/dev/null 2>&1
				systemctl enable docker >/dev/null 2>&1
			fi


    esac
    echo " - Docker installed successfully."
else
    echo " - Docker is installed."
fi
`;

const createTraefikConfig = () => {
	const config = getDefaultServerTraefikConfig();

	const command = `
	if [ -f "/etc/dokploy/traefik/dynamic/acme.json" ]; then
		chmod 600 "/etc/dokploy/traefik/dynamic/acme.json"
	fi
	if [ -f "/etc/dokploy/traefik/traefik.yml" ]; then
		echo "Traefik config already exists ✅"
	else
		echo "${config}" > /etc/dokploy/traefik/traefik.yml
	fi
	`;

	return command;
};

const createDefaultMiddlewares = () => {
	const config = getDefaultMiddlewares();
	const command = `
	if [ -f "/etc/dokploy/traefik/dynamic/middlewares.yml" ]; then
		echo "Middlewares config already exists ✅"
	else
		echo "${config}" > /etc/dokploy/traefik/dynamic/middlewares.yml
	fi
	`;
	return command;
};

export const installRClone = () => `
    if command_exists rclone; then
		echo "RClone already installed ✅"
	else
		curl https://rclone.org/install.sh | sudo bash
		RCLONE_VERSION=$(rclone --version | head -n 1 | awk '{print $2}' | sed 's/^v//')
		echo "RClone version $RCLONE_VERSION installed ✅"
	fi
`;

export const createTraefikInstance = () => {
	const command = `
	    # Check if dokpyloy-traefik exists
		if docker service ls | grep -q 'dokploy-traefik'; then
			echo "Traefik already exists ✅"
		else
			# Create the dokploy-traefik service
			TRAEFIK_VERSION=3.1.2
			docker service create \
				--name dokploy-traefik \
				--replicas 1 \
				--constraint 'node.role==manager' \
				--network dokploy-network \
				--mount type=bind,src=/etc/dokploy/traefik/traefik.yml,dst=/etc/traefik/traefik.yml \
				--mount type=bind,src=/etc/dokploy/traefik/dynamic,dst=/etc/dokploy/traefik/dynamic \
				--mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
				--label traefik.enable=true \
				--publish mode=host,target=443,published=443 \
				--publish mode=host,target=80,published=80 \
				traefik:v$TRAEFIK_VERSION
			echo "Traefik version $TRAEFIK_VERSION installed ✅"
		fi
	`;

	return command;
};

const installNixpacks = () => `
	if command_exists nixpacks; then
		echo "Nixpacks already installed ✅"
	else
	    export NIXPACKS_VERSION=1.29.1
        bash -c "$(curl -fsSL https://nixpacks.com/install.sh)"
		echo "Nixpacks version $NIXPACKS_VERSION installed ✅"
	fi
`;

const installBuildpacks = () => `
	SUFFIX=""
	if [ "$SYS_ARCH" = "aarch64" ] || [ "$SYS_ARCH" = "arm64" ]; then
		SUFFIX="-arm64"
	fi
	if command_exists pack; then
		echo "Buildpacks already installed ✅"
	else
		BUILDPACKS_VERSION=0.35.0
		curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.35.0/pack-v$BUILDPACKS_VERSION-linux$SUFFIX.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack
		echo "Buildpacks version $BUILDPACKS_VERSION installed ✅"
	fi
`;
