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
	TRAEFIK_HTTP3_PORT,
	TRAEFIK_PORT,
	TRAEFIK_SSL_PORT,
	TRAEFIK_VERSION,
} from "@dokploy/server/setup/traefik-setup";
import slug from "slugify";
import { Client } from "ssh2";
import { recreateDirectory } from "../utils/filesystem/directory";

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

export const serverSetup = async (
	serverId: string,
	onData?: (data: any) => void,
) => {
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

	try {
		onData?.("\nInstalling Server Dependencies: ✅\n");
		await installRequirements(serverId, onData);

		await updateDeploymentStatus(deployment.deploymentId, "done");

		onData?.("\nSetup Server: ✅\n");
	} catch (err) {
		console.log(err);

		await updateDeploymentStatus(deployment.deploymentId, "error");
		onData?.(`${err} ❌\n`);
	}
};

export const defaultCommand = () => {
	const bashCommand = `
set -e;
DOCKER_VERSION=27.0.3
OS_TYPE=$(grep -w "ID" /etc/os-release | cut -d "=" -f 2 | tr -d '"')
SYS_ARCH=$(uname -m)
CURRENT_USER=$USER

echo "Installing requirements for: OS: $OS_TYPE"

# Check if running as root or if sudo is available
if [ $EUID = 0 ]; then
	echo "Running as root user ✅"
	SUDO_CMD=""
elif sudo -n true 2>/dev/null; then
	echo "Running with sudo privileges ✅"
	SUDO_CMD="sudo"
elif command -v sudo >/dev/null 2>&1; then
	echo "Sudo is available, but may require password ⚠️"
	echo "For automated deployment, consider setting up passwordless sudo for this user"
	SUDO_CMD="sudo"
else
	echo "This script requires root privileges or sudo access ❌"
	echo "Please run with: sudo $0 or as root user"
	exit 1
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

if [ "$OS_TYPE" = 'amzn' ]; then
    $SUDO_CMD dnf install -y findutils >/dev/null
fi

case "$OS_TYPE" in
arch | ubuntu | debian | raspbian | centos | fedora | rhel | ol | rocky | sles | opensuse-leap | opensuse-tumbleweed | almalinux | opencloudos | amzn | alpine) ;;
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

echo -e "4.1. Adding user to Docker group"
${addUserToDockerGroup()}

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

echo -e "13. Installing Railpack"
${installRailpack()}
				`;

	return bashCommand;
};

const installRequirements = async (
	serverId: string,
	onData?: (data: any) => void,
) => {
	const client = new Client();
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		onData?.("❌ No SSH Key found, please assign one to this server");
		throw new Error("No SSH Key found");
	}

	return new Promise<void>((resolve, reject) => {
		client
			.once("ready", () => {
				const command = server.command || defaultCommand();
				client.exec(command, (err, stream) => {
					if (err) {
						onData?.(err.message);
						reject(err);
						return;
					}
					stream
						.on("close", () => {
							client.end();
							resolve();
						})
						.on("data", (data: string) => {
							onData?.(data.toString());
						})
						.stderr.on("data", (data) => {
							onData?.(data.toString());
						});
				});
			})
			.on("error", (err) => {
				client.end();
				if (err.level === "client-authentication") {
					onData?.(
						`Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`,
					);
					reject(
						new Error(
							`Authentication failed: Invalid SSH private key. ❌ Error: ${err.message} ${err.level}`,
						),
					);
				} else {
					onData?.(`SSH connection error: ${err.message} ${err.level}`);
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
		$SUDO_CMD mkdir -p /etc/dokploy
		$SUDO_CMD chmod 777 /etc/dokploy

		echo "Directory /etc/dokploy created ✅"
	fi
`;

export const setupSwarm = () => `
		# Check if the node is already part of a Docker Swarm
		if $SUDO_CMD docker info | grep -q 'Swarm: active'; then
			echo "Already part of a Docker Swarm ✅"
		else
			# Get IP address
			get_ip() {
				local ip=""

				# Try IPv4 with multiple services
				# First attempt: ifconfig.io
				ip=\$(curl -4s --connect-timeout 5 https://ifconfig.io 2>/dev/null)

				# Second attempt: icanhazip.com
				if [ -z "\$ip" ]; then
					ip=\$(curl -4s --connect-timeout 5 https://icanhazip.com 2>/dev/null)
				fi

				# Third attempt: ipecho.net
				if [ -z "\$ip" ]; then
					ip=\$(curl -4s --connect-timeout 5 https://ipecho.net/plain 2>/dev/null)
				fi

				# If no IPv4, try IPv6 with multiple services
				if [ -z "\$ip" ]; then
					# Try IPv6 with ifconfig.io
					ip=\$(curl -6s --connect-timeout 5 https://ifconfig.io 2>/dev/null)

					# Try IPv6 with icanhazip.com
					if [ -z "\$ip" ]; then
						ip=\$(curl -6s --connect-timeout 5 https://icanhazip.com 2>/dev/null)
					fi

					# Try IPv6 with ipecho.net
					if [ -z "\$ip" ]; then
						ip=\$(curl -6s --connect-timeout 5 https://ipecho.net/plain 2>/dev/null)
					fi
				fi

				if [ -z "\$ip" ]; then
					echo "Error: Could not determine server IP address automatically (neither IPv4 nor IPv6)." >&2
					echo "Please set the ADVERTISE_ADDR environment variable manually." >&2
					echo "Example: export ADVERTISE_ADDR=<your-server-ip>" >&2
					exit 1
				fi

				echo "\$ip"
			}
			advertise_addr=\$(get_ip)
			echo "Advertise address: \$advertise_addr"

			# Initialize Docker Swarm
			$SUDO_CMD docker swarm init --advertise-addr \$advertise_addr
			echo "Swarm initialized ✅"
		fi
	`;

const setupNetwork = () => `
	# Check if the dokploy-network already exists
	if $SUDO_CMD docker network ls | grep -q 'dokploy-network'; then
		echo "Network dokploy-network already exists ✅"
	else
		# Create the dokploy-network if it doesn't exist
		if $SUDO_CMD docker network create --driver overlay --attachable dokploy-network; then
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
		$SUDO_CMD pacman -Sy --noconfirm --needed curl wget git git-lfs jq openssl >/dev/null || true
		;;
	alpine)
		$SUDO_CMD sed -i '/^#.*\/community/s/^#//' /etc/apk/repositories
		$SUDO_CMD apk update >/dev/null
		$SUDO_CMD apk add curl wget git git-lfs jq openssl sudo unzip tar >/dev/null
		;;
	ubuntu | debian | raspbian)
		DEBIAN_FRONTEND=noninteractive $SUDO_CMD apt-get update -y >/dev/null
		DEBIAN_FRONTEND=noninteractive $SUDO_CMD apt-get install -y unzip curl wget git git-lfs jq openssl >/dev/null
		;;
	centos | fedora | rhel | ol | rocky | almalinux | opencloudos | amzn)
		if [ "$OS_TYPE" = "amzn" ]; then
			$SUDO_CMD dnf install -y wget git git-lfs jq openssl >/dev/null
		else
			if ! command -v dnf >/dev/null; then
				$SUDO_CMD yum install -y dnf >/dev/null
			fi
			if ! command -v curl >/dev/null; then
				$SUDO_CMD dnf install -y curl >/dev/null
			fi
			$SUDO_CMD dnf install -y wget git git-lfs jq openssl unzip >/dev/null
		fi
		;;
	sles | opensuse-leap | opensuse-tumbleweed)
		$SUDO_CMD zypper refresh >/dev/null
		$SUDO_CMD zypper install -y curl wget git git-lfs jq openssl >/dev/null
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
            $SUDO_CMD dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo >/dev/null 2>&1
            $SUDO_CMD dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Docker could not be installed automatically. Please visit https://docs.docker.com/engine/install/ and install Docker manually to continue."
                exit 1
            fi
            $SUDO_CMD systemctl start docker >/dev/null 2>&1
            $SUDO_CMD systemctl enable docker >/dev/null 2>&1
            ;;
	"opencloudos")
            # Special handling for OpenCloud OS
            echo " - Installing Docker for OpenCloud OS..."
            $SUDO_CMD dnf install -y docker >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Docker could not be installed automatically. Please visit https://docs.docker.com/engine/install/ and install Docker manually to continue."
                exit 1
            fi
            
            # Remove --live-restore parameter from Docker configuration if it exists
            if [ -f "/etc/sysconfig/docker" ]; then
                echo " - Removing --live-restore parameter from Docker configuration..."
                $SUDO_CMD sed -i 's/--live-restore[^[:space:]]*//' /etc/sysconfig/docker >/dev/null 2>&1
                $SUDO_CMD sed -i 's/--live-restore//' /etc/sysconfig/docker >/dev/null 2>&1
                # Clean up any double spaces that might be left
                $SUDO_CMD sed -i 's/  */ /g' /etc/sysconfig/docker >/dev/null 2>&1
            fi
            
            $SUDO_CMD systemctl enable docker >/dev/null 2>&1
            $SUDO_CMD systemctl start docker >/dev/null 2>&1
            echo " - Docker configured for OpenCloud OS"
            ;;
        "alpine")
            $SUDO_CMD apk add docker docker-cli-compose >/dev/null 2>&1
            $SUDO_CMD rc-update add docker default >/dev/null 2>&1
            $SUDO_CMD service docker start >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Failed to install Docker with apk. Try to install it manually."
                echo "   Please visit https://wiki.alpinelinux.org/wiki/Docker for more information."
                exit 1
            fi
            ;;
        "arch")
            $SUDO_CMD pacman -Sy docker docker-compose --noconfirm >/dev/null 2>&1
            $SUDO_CMD systemctl enable docker.service >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Failed to install Docker with pacman. Try to install it manually."
                echo "   Please visit https://wiki.archlinux.org/title/docker for more information."
                exit 1
            fi
            ;;
        "amzn")
            $SUDO_CMD dnf install docker -y >/dev/null 2>&1
            DOCKER_CONFIG=/usr/local/lib/docker
            $SUDO_CMD mkdir -p $DOCKER_CONFIG/cli-plugins >/dev/null 2>&1
            $SUDO_CMD curl -sL https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m) -o $DOCKER_CONFIG/cli-plugins/docker-compose >/dev/null 2>&1
            $SUDO_CMD chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose >/dev/null 2>&1
            $SUDO_CMD systemctl start docker >/dev/null 2>&1
            $SUDO_CMD systemctl enable docker >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Failed to install Docker with dnf. Try to install it manually."
                echo "   Please visit https://www.cyberciti.biz/faq/how-to-install-docker-on-amazon-linux-2/ for more information."
                exit 1
            fi
            ;;
        "fedora")
            if [ -x "$(command -v dnf5)" ]; then
                # dnf5 is available
                $SUDO_CMD dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo --overwrite >/dev/null 2>&1
            else
                # dnf5 is not available, use dnf
                $SUDO_CMD dnf config-manager --add-repo=https://download.docker.com/linux/fedora/docker-ce.repo >/dev/null 2>&1
            fi
            $SUDO_CMD dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                echo " - Docker could not be installed automatically. Please visit https://docs.docker.com/engine/install/ and install Docker manually to continue."
                exit 1
            fi
            $SUDO_CMD systemctl start docker >/dev/null 2>&1
            $SUDO_CMD systemctl enable docker >/dev/null 2>&1
            ;;
        *)
            if [ "$OS_TYPE" = "ubuntu" ] && [ "$OS_VERSION" = "24.10" ]; then
                echo "Docker automated installation is not supported on Ubuntu 24.10 (non-LTS release)."
                    echo "Please install Docker manually."
                exit 1
            fi
            curl -s https://releases.rancher.com/install-docker/$DOCKER_VERSION.sh | $SUDO_CMD sh 2>&1
            if ! [ -x "$(command -v docker)" ]; then
                curl -s https://get.docker.com | $SUDO_CMD sh -s -- --version $DOCKER_VERSION 2>&1
                if ! [ -x "$(command -v docker)" ]; then
                    echo " - Docker installation failed."
                    echo "   Maybe your OS is not supported?"
                    echo " - Please visit https://docs.docker.com/engine/install/ and install Docker manually to continue."
                    exit 1
                fi
            fi
			if [ "$OS_TYPE" = "rocky" ]; then
				$SUDO_CMD systemctl start docker >/dev/null 2>&1
				$SUDO_CMD systemctl enable docker >/dev/null 2>&1
			fi

			if [ "$OS_TYPE" = "centos" ]; then
				$SUDO_CMD systemctl start docker >/dev/null 2>&1
				$SUDO_CMD systemctl enable docker >/dev/null 2>&1
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
		$SUDO_CMD chmod 600 "/etc/dokploy/traefik/dynamic/acme.json"
	fi
	if [ -f "/etc/dokploy/traefik/traefik.yml" ]; then
		echo "Traefik config already exists ✅"
	else
		echo "${config}" | $SUDO_CMD tee /etc/dokploy/traefik/traefik.yml > /dev/null
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
		echo "${config}" | $SUDO_CMD tee /etc/dokploy/traefik/dynamic/middlewares.yml > /dev/null
	fi
	`;
	return command;
};

export const installRClone = () => `
    if command_exists rclone; then
		echo "RClone already installed ✅"
	else
		curl https://rclone.org/install.sh | $SUDO_CMD bash
		RCLONE_VERSION=$(rclone --version | head -n 1 | awk '{print $2}' | sed 's/^v//')
		echo "RClone version $RCLONE_VERSION installed ✅"
	fi
`;

const addUserToDockerGroup = () => `
	# Add current user to docker group if not root and docker group exists
	if [ $EUID != 0 ] && getent group docker > /dev/null 2>&1; then
		if ! groups $CURRENT_USER | grep -q docker; then
			echo "Adding user $CURRENT_USER to docker group..."
			$SUDO_CMD usermod -aG docker $CURRENT_USER
			echo "User added to docker group. You may need to log out and back in for changes to take effect ✅"
			echo "Note: Docker commands in this script will still use sudo until you log out and back in"
		else
			echo "User $CURRENT_USER already in docker group ✅"
		fi
	fi
`;

export const createTraefikInstance = () => {
	const command = `
	    # Check if dokpyloy-traefik exists
		if $SUDO_CMD docker service inspect dokploy-traefik > /dev/null 2>&1; then
			echo "Migrating Traefik to Standalone..."
			$SUDO_CMD docker service rm dokploy-traefik
			sleep 8
			echo "Traefik migrated to Standalone ✅"
		fi

		if $SUDO_CMD docker inspect dokploy-traefik > /dev/null 2>&1; then
			echo "Traefik already exists ✅"
		else
			# Create the dokploy-traefik container
			TRAEFIK_VERSION=${TRAEFIK_VERSION}
			$SUDO_CMD docker run -d \
				--name dokploy-traefik \
				--network dokploy-network \
				--restart unless-stopped \
				-v /etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml \
				-v /etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic \
				-v /var/run/docker.sock:/var/run/docker.sock \
				-p ${TRAEFIK_SSL_PORT}:${TRAEFIK_SSL_PORT} \
				-p ${TRAEFIK_PORT}:${TRAEFIK_PORT} \
				-p ${TRAEFIK_HTTP3_PORT}:${TRAEFIK_HTTP3_PORT}/udp \
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
	    export NIXPACKS_VERSION=1.39.0
        bash -c "$(curl -fsSL https://nixpacks.com/install.sh)"
		echo "Nixpacks version $NIXPACKS_VERSION installed ✅"
	fi
`;

const installRailpack = () => `
	if command_exists railpack; then
		echo "Railpack already installed ✅"
	else
	    export RAILPACK_VERSION=0.2.2
		bash -c "$(curl -fsSL https://railpack.com/install.sh)"
		echo "Railpack version $RAILPACK_VERSION installed ✅"
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
		curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.35.0/pack-v$BUILDPACKS_VERSION-linux$SUFFIX.tgz" | $SUDO_CMD tar -C /usr/local/bin/ --no-same-owner -xzv pack
		echo "Buildpacks version $BUILDPACKS_VERSION installed ✅"
	fi
`;
