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
import { chmodSync, createWriteStream } from "node:fs";
import { Client } from "ssh2";
import { readSSHKey } from "../filesystem/ssh";

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
			.on("ready", () => {
				console.log("Client :: ready");
				const bashCommand = `
				# check if something is running on port 80
				if ss -tulnp | grep ':80 ' >/dev/null; then
					echo "Error: something is already running on port 80" >&2
					exit 1
				fi
	
				# check if something is running on port 443
				if ss -tulnp | grep ':443 ' >/dev/null; then
					echo "Error: something is already running on port 443" >&2
					exit 1
				fi
	
				command_exists() {
					command -v "$@" > /dev/null 2>&1
				}
	
				if command_exists docker; then
					echo "Docker already installed ✅"
				else
					echo "Installing Docker ✅"
					curl -sSL https://get.docker.com | sh -s -- --version 27.2.0
				fi
	
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
	
				# Check if the dokploy-network already exists
				if docker network ls | grep -q 'dokploy-network'; then
					echo "Network dokploy-network already exists ✅"
				else
					# Create the dokploy-network if it doesn't exist
					docker network create --driver overlay --attachable dokploy-network
					echo "Network created ✅"
				fi
	
				# Check if the /etc/dokploy directory exists
				if [ -d /etc/dokploy ]; then
					echo "/etc/dokploy already exists ✅"
				else
					# Create the /etc/dokploy directory
					mkdir -p /etc/dokploy
					chmod 777 /etc/dokploy
					echo "Directory /etc/dokploy created ✅"
				fi

				${setupDirectories()}
	
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
						.on("data", (data) => {
							writeStream.write(data.toString());
							console.log(`OUTPUT: ${data}`);
						})
						.stderr.on("data", (data) => {
							writeStream.write(data.toString());
							console.log(`STDERR: ${data}`);
						});
				});
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: keys.privateKey,
				timeout: 10000,
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

	console.log(command);
	return command;
};

export const setupSwarm = async () => {
	const command = `
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

	console.log(command);
	return command;
};

// mkdir -p "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker" && mkdir -p "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker/traefik" && mkdir -p "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker/traefik/dynamic" && mkdir -p "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker/logs" && mkdir -p "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker/applications" && mkdir -p "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker/ssh" && mkdir -p "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker/traefik/dynamic/certificates" && mkdir -p "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker/monitoring"
//     chmod 700 "/Users/mauricio/Documents/Github/Personal/dokploy/apps/dokploy/.docker/ssh"
