import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";

export const getContainers = async (serverId?: string | null) => {
	try {
		const command =
			"docker ps -a --format 'CONTAINER ID : {{.ID}} | Name: {{.Names}} | Image: {{.Image}} | Ports: {{.Ports}} | State: {{.State}} | Status: {{.Status}}'";
		let stdout = "";
		let stderr = "";

		if (serverId) {
			const result = await execAsyncRemote(serverId, command);

			stdout = result.stdout;
			stderr = result.stderr;
		} else {
			const result = await execAsync(command);
			stdout = result.stdout;
			stderr = result.stderr;
		}
		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		const lines = stdout.trim().split("\n");

		const containers = lines
			.map((line) => {
				const parts = line.split(" | ");
				const containerId = parts[0]
					? parts[0].replace("CONTAINER ID : ", "").trim()
					: "No container id";
				const name = parts[1]
					? parts[1].replace("Name: ", "").trim()
					: "No container name";
				const image = parts[2]
					? parts[2].replace("Image: ", "").trim()
					: "No image";
				const ports = parts[3]
					? parts[3].replace("Ports: ", "").trim()
					: "No ports";
				const state = parts[4]
					? parts[4].replace("State: ", "").trim()
					: "No state";
				const status = parts[5]
					? parts[5].replace("Status: ", "").trim()
					: "No status";
				return {
					containerId,
					name,
					image,
					ports,
					state,
					status,
					serverId,
				};
			})
			.filter(
				(container) =>
					!container.name.includes("dokploy") ||
					container.name.includes("dokploy-monitoring"),
			);

		return containers;
	} catch (error) {
		console.error(error);

		return [];
	}
};

export const getConfig = async (
	containerId: string,
	serverId?: string | null,
) => {
	try {
		const command = `docker inspect ${containerId} --format='{{json .}}'`;
		let stdout = "";
		let stderr = "";
		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			stdout = result.stdout;
			stderr = result.stderr;
		} else {
			const result = await execAsync(command);
			stdout = result.stdout;
			stderr = result.stderr;
		}

		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		const config = JSON.parse(stdout);

		return config;
	} catch {}
};

export const getContainersByAppNameMatch = async (
	appName: string,
	appType?: "stack" | "docker-compose",
	serverId?: string,
) => {
	try {
		let result: string[] = [];
		const cmd =
			"docker ps -a --format 'CONTAINER ID : {{.ID}} | Name: {{.Names}} | State: {{.State}} | Status: {{.Status}}'";

		const command =
			appType === "docker-compose"
				? `${cmd} --filter='label=com.docker.compose.project=${appName}'`
				: `${cmd} | grep '^.*Name: ${appName}'`;
		if (serverId) {
			const { stdout, stderr } = await execAsyncRemote(serverId, command);

			if (stderr) {
				return [];
			}

			if (!stdout) return [];
			result = stdout.trim().split("\n");
		} else {
			const { stdout, stderr } = await execAsync(command);

			if (stderr) {
				return [];
			}

			if (!stdout) return [];

			result = stdout.trim().split("\n");
		}

		const containers = result.map((line) => {
			const parts = line.split(" | ");
			const containerId = parts[0]
				? parts[0].replace("CONTAINER ID : ", "").trim()
				: "No container id";
			const name = parts[1]
				? parts[1].replace("Name: ", "").trim()
				: "No container name";

			const state = parts[2]
				? parts[2].replace("State: ", "").trim()
				: "No state";

			const status = parts[3] ? parts[3].replace("Status: ", "").trim() : "";

			return {
				containerId,
				name,
				state,
				status,
			};
		});

		return containers || [];
	} catch {}

	return [];
};

export const getStackContainersByAppName = async (
	appName: string,
	serverId?: string,
) => {
	try {
		let result: string[] = [];

		const command = `docker stack ps ${appName} --no-trunc --format 'CONTAINER ID : {{.ID}} | Name: {{.Name}} | State: {{.DesiredState}} | Node: {{.Node}} | CurrentState: {{.CurrentState}} | Error: {{.Error}}'`;

		console.log("command	", command);
		if (serverId) {
			const { stdout, stderr } = await execAsyncRemote(serverId, command);

			if (stderr) {
				return [];
			}

			if (!stdout) return [];
			result = stdout.trim().split("\n");
		} else {
			const { stdout, stderr } = await execAsync(command);

			if (stderr) {
				return [];
			}

			if (!stdout) return [];

			result = stdout.trim().split("\n");
		}

		const containers = result.map((line) => {
			const parts = line.split(" | ");
			const containerId = parts[0]
				? parts[0].replace("CONTAINER ID : ", "").trim()
				: "No container id";
			const name = parts[1]
				? parts[1].replace("Name: ", "").trim()
				: "No container name";

			const state = parts[2]
				? parts[2].replace("State: ", "").trim().toLowerCase()
				: "No state";
			const node = parts[3]
				? parts[3].replace("Node: ", "").trim()
				: "No specific node";
			const currentState = parts[4]
				? parts[4].replace("CurrentState: ", "").trim()
				: "";
			const error = parts[5] ? parts[5].replace("Error: ", "").trim() : "";
			return {
				containerId,
				name,
				state,
				node,
				currentState,
				error,
			};
		});

		return containers || [];
	} catch {}

	return [];
};

export const getServiceContainersByAppName = async (
	appName: string,
	serverId?: string,
) => {
	try {
		let result: string[] = [];

		const command = `docker service ps ${appName} --no-trunc --format 'CONTAINER ID : {{.ID}} | Name: {{.Name}} | State: {{.DesiredState}} | Node: {{.Node}} | CurrentState: {{.CurrentState}} | Error: {{.Error}}'`;
		if (serverId) {
			const { stdout, stderr } = await execAsyncRemote(serverId, command);

			if (stderr) {
				return [];
			}

			if (!stdout) return [];
			result = stdout.trim().split("\n");
		} else {
			const { stdout, stderr } = await execAsync(command);

			if (stderr) {
				return [];
			}

			if (!stdout) return [];

			result = stdout.trim().split("\n");
		}

		const containers = result.map((line) => {
			const parts = line.split(" | ");
			const containerId = parts[0]
				? parts[0].replace("CONTAINER ID : ", "").trim()
				: "No container id";
			const name = parts[1]
				? parts[1].replace("Name: ", "").trim()
				: "No container name";

			const state = parts[2]
				? parts[2].replace("State: ", "").trim().toLowerCase()
				: "No state";

			const node = parts[3]
				? parts[3].replace("Node: ", "").trim()
				: "No specific node";

			const currentState = parts[4]
				? parts[4].replace("CurrentState: ", "").trim()
				: "";
			const error = parts[5] ? parts[5].replace("Error: ", "").trim() : "";
			return {
				containerId,
				name,
				state,
				currentState,
				node,
				error,
			};
		});

		return containers || [];
	} catch {}

	return [];
};

export const getContainersByAppLabel = async (
	appName: string,
	type: "standalone" | "swarm",
	serverId?: string,
) => {
	try {
		let stdout = "";
		let stderr = "";

		const command =
			type === "swarm"
				? `docker ps --filter "label=com.docker.swarm.service.name=${appName}" --format 'CONTAINER ID : {{.ID}} | Name: {{.Names}} | State: {{.State}}'`
				: type === "standalone"
					? `docker ps --filter "name=${appName}" --format 'CONTAINER ID : {{.ID}} | Name: {{.Names}} | State: {{.State}}'`
					: `docker ps --filter "label=com.docker.compose.project=${appName}" --format 'CONTAINER ID : {{.ID}} | Name: {{.Names}} | State: {{.State}}'`;
		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			stdout = result.stdout;
			stderr = result.stderr;
		} else {
			const result = await execAsync(command);
			stdout = result.stdout;
			stderr = result.stderr;
		}
		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		if (!stdout) return [];

		const lines = stdout.trim().split("\n");

		const containers = lines.map((line) => {
			const parts = line.split(" | ");
			const containerId = parts[0]
				? parts[0].replace("CONTAINER ID : ", "").trim()
				: "No container id";
			const name = parts[1]
				? parts[1].replace("Name: ", "").trim()
				: "No container name";
			const state = parts[2]
				? parts[2].replace("State: ", "").trim()
				: "No state";
			return {
				containerId,
				name,
				state,
			};
		});

		return containers || [];
	} catch {}

	return [];
};

export const getContainerLogs = async (
	appName: string,
	tail = 100,
	since = "all",
	search?: string,
	serverId?: string | null,
): Promise<string> => {
	const sinceFlag = since === "all" ? "" : `--since ${since}`;
	const baseCommand = `docker container logs --timestamps --tail ${tail} ${sinceFlag} ${appName}`;

	const escapedSearch = search?.replace(/'/g, "'\\''") ?? "";
	const command = search
		? `${baseCommand} 2>&1 | grep -iF '${escapedSearch}'`
		: `${baseCommand} 2>&1`;

	try {
		const result = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		return result.stdout;
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"stdout" in error &&
			typeof (error as { stdout: string }).stdout === "string" &&
			(error as { stdout: string }).stdout.length > 0
		) {
			return (error as { stdout: string }).stdout;
		}
		throw error;
	}
};

export const containerRestart = async (containerId: string) => {
	try {
		const { stdout, stderr } = await execAsync(
			`docker container restart ${containerId}`,
		);

		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		const config = JSON.parse(stdout);

		return config;
	} catch {}
};

export const containerRemove = async (
	containerId: string,
	serverId?: string,
) => {
	const command = `docker rm -f ${containerId}`;
	const { stderr } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	if (stderr) {
		console.error(`Error: ${stderr}`);
		throw new Error(stderr);
	}
};

export const getSwarmNodes = async (serverId?: string) => {
	try {
		let stdout = "";
		let stderr = "";
		const command = "docker node ls --format '{{json .}}'";

		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			stdout = result.stdout;
			stderr = result.stderr;
		} else {
			const result = await execAsync(command);
			stdout = result.stdout;
			stderr = result.stderr;
		}

		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		const nodesArray = stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		return nodesArray;
	} catch (error) {
		console.error("getSwarmNodes error:", error);
	}
};

export const getNodeInfo = async (nodeId: string, serverId?: string) => {
	try {
		const command = `docker node inspect ${nodeId} --format '{{json .}}'`;
		let stdout = "";
		let stderr = "";
		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			stdout = result.stdout;
			stderr = result.stderr;
		} else {
			const result = await execAsync(command);
			stdout = result.stdout;
			stderr = result.stderr;
		}

		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		const nodeInfo = JSON.parse(stdout);

		return nodeInfo;
	} catch {}
};

export const getNodeApplications = async (serverId?: string) => {
	try {
		let stdout = "";
		let stderr = "";
		const command = `docker service ls --format '{{json .}}'`;

		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			stdout = result.stdout;
			stderr = result.stderr;
		} else {
			const result = await execAsync(command);

			stdout = result.stdout;
			stderr = result.stderr;
		}

		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		if (!stdout.trim()) {
			return [];
		}

		const appArray = stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((service) => !service.Name.startsWith("dokploy-"));

		return appArray;
	} catch (error) {
		console.error("getNodeApplications error:", error);
		return [];
	}
};

export const getApplicationInfo = async (
	appNames: string[],
	serverId?: string,
) => {
	if (appNames.length === 0) {
		return [];
	}
	try {
		let stdout = "";
		let stderr = "";
		const command = `docker service ps ${appNames.join(" ")} --format '{{json .}}' --no-trunc`;

		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			stdout = result.stdout;
			stderr = result.stderr;
		} else {
			const result = await execAsync(command);
			stdout = result.stdout;
			stderr = result.stderr;
		}

		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		if (!stdout.trim()) {
			return [];
		}

		const appArray = stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		return appArray;
	} catch (error) {
		console.error("getApplicationInfo error:", error);
		return [];
	}
};

export const getAllContainerStats = async (serverId?: string) => {
	try {
		let stdout = "";
		const command =
			'docker stats --no-stream --format \'{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}\'';

		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			stdout = result.stdout;
		} else {
			const result = await execAsync(command);
			stdout = result.stdout;
		}

		if (!stdout.trim()) {
			return [];
		}

		const stats = stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		return stats;
	} catch (error) {
		console.error("getAllContainerStats error:", error);
		return [];
	}
};

export const uploadFileToContainer = async (
	containerId: string,
	fileBuffer: Buffer,
	fileName: string,
	destinationPath: string,
	serverId?: string | null,
): Promise<void> => {
	const containerIdRegex = /^[a-zA-Z0-9.\-_]+$/;
	if (!containerIdRegex.test(containerId)) {
		throw new Error("Invalid container ID");
	}

	// Ensure destination path starts with /
	const normalizedPath = destinationPath.startsWith("/")
		? destinationPath
		: `/${destinationPath}`;

	const base64Content = fileBuffer.toString("base64");
	const tempFileName = `dokploy-upload-${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
	const tempPath = `/tmp/${tempFileName}`;

	const command = `echo '${base64Content}' | base64 -d > "${tempPath}" && docker cp "${tempPath}" "${containerId}:${normalizedPath}" ; rm -f "${tempPath}"`;

	try {
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	} catch (error) {
		throw new Error(
			`Failed to upload file to container: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};
