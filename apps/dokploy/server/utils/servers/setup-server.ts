import { findServerById } from "@/server/api/services/server";
import { recreateDirectory } from "../filesystem/directory";
import { slugify } from "@/lib/slug";
import path from "node:path";
import {
	APPLICATIONS_PATH,
	BASE_PATH,
	CERTIFICATES_PATH,
	DYNAMIC_TRAEFIK_PATH,
	getPaths,
	LOGS_PATH,
	MAIN_TRAEFIK_PATH,
	MONITORING_PATH,
	SSH_PATH,
} from "@/server/constants";
import {
	createServerDeployment,
	updateDeploymentStatus,
} from "@/server/api/services/deployment";
import { createWriteStream } from "node:fs";
import { Client } from "ssh2";
import { readSSHKey } from "../filesystem/ssh";
import {
	getDefaultMiddlewares,
	getDefaultServerTraefikConfig,
	getDefaultTraefikConfig,
} from "@/server/setup/traefik-setup";

export const setupServer = async (serverId: string) => {
	const server = await findServerById(serverId);

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
		await connectToServer(serverId, deployment.logPath);

		writeStream.close();

		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (err) {
		console.log(err);
		await updateDeploymentStatus(deployment.deploymentId, "error");
		writeStream.write(err);
		writeStream.close();
	}
};

const setupTraefikInstance = async (serverId: string) => {};

const connectToServer = async (serverId: string, logPath: string) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const client = new Client();
	const server = await findServerById(serverId);
	if (!server.sshKeyId) return;
	const keys = await readSSHKey(server.sshKeyId);
	return new Promise<void>((resolve, reject) => {
		client
			.once("ready", () => {
				console.log("Client :: ready");
				const bashCommand = `
				
				${validatePorts()}

				command_exists() {
					command -v "$@" > /dev/null 2>&1
				}
				${installDocker()}
				${setupSwarm()}
				${setupNetwork()}
				${setupMainDirectory()}
				${setupDirectories()}
				${createTraefikConfig()}
				${createDefaultMiddlewares()}
				${createTraefikInstance()}
				${installNixpacks()}
				${installBuildpacks()}
				${setupRedis()}
				`;

				client.exec(bashCommand, (err, stream) => {
					if (err) {
						writeStream.write(err);
						reject(err);
						return;
					}
					stream
						.on("close", () => {
							writeStream.write("Connection closed ✅");
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
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: keys.privateKey,
				timeout: 99999,
			});
	});
};

const setupDirectories = () => {
	// const directories = [
	// 	BASE_PATH,
	// 	MAIN_TRAEFIK_PATH,
	// 	DYNAMIC_TRAEFIK_PATH,
	// 	LOGS_PATH,
	// 	APPLICATIONS_PATH,
	// 	SSH_PATH,
	// 	CERTIFICATES_PATH,
	// 	MONITORING_PATH,
	// ];

	const directories = getPaths("/etc/dokploy");

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
		docker network create --driver overlay --attachable dokploy-network
		echo "Network created ✅"
	fi
`;

const installDocker = () => `
	if command_exists docker; then
		echo "Docker already installed ✅"
	else
		echo "Installing Docker ✅"
		curl -sSL https://get.docker.com | sh -s -- --version 27.2.0
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

export const createDefaultMiddlewares = () => {
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

export const createTraefikInstance = () => {
	const command = `
	    # Check if dokpyloy-traefik exists
		if docker service ls | grep -q 'dokploy-traefik'; then
			echo "Traefik already exists ✅"
		else
			# Create the dokploy-traefik service
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
			--publish mode=host,target=8080,published=8080 \
			traefik:v3.1.2
		fi
	`;

	return command;
};

const installNixpacks = () => `
	if command_exists nixpacks; then
		echo "Nixpacks already installed ✅"
	else
		VERSION=1.28.1 bash -c "$(curl -fsSL https://nixpacks.com/install.sh)"
		echo "Nixpacks version 1.28.1 installed ✅"
	fi
`;

const installBuildpacks = () => `
	if command_exists pack; then
		echo "Buildpacks already installed ✅"
	else
		curl -sSL "https://github.com/buildpacks/pack/releases/download/v0.35.0/pack-v0.35.0-linux.tgz" | tar -C /usr/local/bin/ --no-same-owner -xzv pack
		echo "Buildpacks version 0.35.0 installed ✅"
	fi
`;

const setupRedis = () => `
	# Check if redis is already installed
	if docker service ls | grep -q 'dokploy-redis'; then
		echo "Redis already installed ✅"
	else
		# Install Redis
		docker service create \
		--name dokploy-redis \
		--replicas 1 \
		--constraint 'node.role==manager' \
		--mount type=volume,source=redis-data-volume,target=/data \
		--network dokploy-network \
		--publish target=6379,published=6379,protocol=tcp,mode=host \
		redis:7
	fi

`;
