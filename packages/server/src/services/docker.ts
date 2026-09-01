import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";

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
		if (appType === "stack") {
			return await getStackTaskContainers(appName, serverId);
		}
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

const getStackTaskContainers = async (appName: string, serverId?: string) => {
	try {
		const divider = "__DOKPLOY_DIVIDER__";
		const tasksCommand = `docker stack ps ${appName} --no-trunc --filter "desired-state=running" --format 'TASK : {{.ID}} | Name: {{.Name}} | Node: {{.Node}} | CurrentState: {{.CurrentState}} | Error: {{.Error}}'`;
		const inspectCommand = `docker stack ps ${appName} -q --no-trunc --filter "desired-state=running" | xargs -r docker inspect --format '{{if .Status.ContainerStatus}}TASK : {{.ID}} | ContainerId: {{.Status.ContainerStatus.ContainerID}}{{end}}' 2>/dev/null`;
		const command = `${tasksCommand} && echo "${divider}" && (${inspectCommand} || true)`;

		let stdout = "";

		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			stdout = result.stdout;
		} else {
			const result = await execAsync(command);
			stdout = result.stdout;
		}

		if (!stdout) return [];

		const [tasksSection = "", inspectSection = ""] = stdout.split(divider);

		const containerIdByTask = new Map<string, string>();
		for (const line of inspectSection.trim().split("\n")) {
			const parts = line.split(" | ");
			const taskId = parts[0]?.replace("TASK : ", "").trim();
			const containerId = parts[1]?.replace("ContainerId: ", "").trim();
			if (taskId && containerId) {
				containerIdByTask.set(taskId, containerId);
			}
		}

		const containers = [];

		for (const line of tasksSection.trim().split("\n")) {
			if (!line) continue;
			const parts = line.split(" | ");
			const taskId = parts[0]?.replace("TASK : ", "").trim() ?? "";
			const name = parts[1]?.replace("Name: ", "").trim() ?? "";
			const node = parts[2]?.replace("Node: ", "").trim() ?? "";
			const currentState = parts[3]
				? parts[3].replace("CurrentState: ", "").trim()
				: "";
			const error = parts[4] ? parts[4].replace("Error: ", "").trim() : "";
			const containerId = containerIdByTask.get(taskId) ?? "";

			containers.push({
				containerId: containerId.slice(0, 12),
				name: `${name}.${taskId}`,
				node,
				state: currentState.split(" ")[0]?.toLowerCase() ?? "No state",
				status: error ? `${currentState} (${error})` : currentState,
			});
		}

		return containers;
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
	appNameOrId: string,
	tail = 100,
	since = "all",
	search?: string,
	serverId?: string | null,
	useContainerIdDirectly = false,
): Promise<string> => {
	const exec = (cmd: string) =>
		serverId ? execAsyncRemote(serverId, cmd) : execAsync(cmd);

	let target = appNameOrId;
	let isService = false;

	if (!useContainerIdDirectly) {
		// Find the real container ID by appName filter
		const findResult = await exec(
			`docker ps -q --filter "name=^${appNameOrId}" | head -1`,
		);
		const containerId = findResult.stdout.trim();

		if (!containerId) {
			// Fallback: try as a swarm service
			const svcResult = await exec(
				`docker service ls -q --filter "name=${appNameOrId}" | head -1`,
			);
			const serviceId = svcResult.stdout.trim();
			if (!serviceId) {
				throw new Error(`No container or service found for: ${appNameOrId}`);
			}
			isService = true;
		} else {
			target = containerId;
		}
	}

	const sinceFlag = since === "all" ? "" : `--since ${since}`;
	const baseCommand = isService
		? `docker service logs --timestamps --raw --tail ${tail} ${sinceFlag} ${target}`
		: `docker container logs --timestamps --tail ${tail} ${sinceFlag} ${target}`;

	const escapedSearch = search?.replace(/'/g, "'\\''") ?? "";
	const command = search
		? `${baseCommand} 2>&1 | grep -iF '${escapedSearch}'`
		: `${baseCommand} 2>&1`;

	try {
		const result = await exec(command);
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

export const containerRestart = async (
	containerId: string,
	serverId?: string,
) => {
	const command = `docker container restart ${containerId}`;
	const { stderr } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	if (stderr) {
		console.error(`Error: ${stderr}`);
		throw new Error(stderr);
	}
};

export const containerStart = async (
	containerId: string,
	serverId?: string,
) => {
	const command = `docker container start ${containerId}`;
	const { stderr } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	if (stderr) {
		console.error(`Error: ${stderr}`);
		throw new Error(stderr);
	}
};

export const containerStop = async (containerId: string, serverId?: string) => {
	const command = `docker container stop ${containerId}`;
	const { stderr } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	if (stderr) {
		console.error(`Error: ${stderr}`);
		throw new Error(stderr);
	}
};

export const containerKill = async (containerId: string, serverId?: string) => {
	const command = `docker container kill ${containerId}`;
	const { stderr } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	if (stderr) {
		console.error(`Error: ${stderr}`);
		throw new Error(stderr);
	}
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
		const command = `docker node inspect ${quote([nodeId])} --format '{{json .}}'`;
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

const destinationPathRegex = /^[a-zA-Z0-9.\-_/]+$/;

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

	if (!destinationPathRegex.test(destinationPath)) {
		throw new Error(
			"Invalid destination path: shell metacharacters are not allowed",
		);
	}

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

export const CONTAINER_FILE_SIZE_LIMIT = 512 * 1024;

const NO_SHELL_UTILITIES_ERROR =
	"This container image has no shell utilities and its filesystem is not accessible from the Dokploy host.";

const isMissingBinaryError = (error: unknown) =>
	error instanceof ExecError &&
	(error.exitCode === 126 ||
		error.exitCode === 127 ||
		!!error.stderr?.includes("executable file not found"));

export const listContainerFiles = async (
	containerId: string,
	path: string,
	serverId?: string,
) => {
	const command = `docker exec ${quote([containerId])} ls -1Ap ${quote([path])}`;
	let stdout: string;
	try {
		({ stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command));
	} catch (error) {
		if (isMissingBinaryError(error)) {
			throw new Error(NO_SHELL_UTILITIES_ERROR);
		}
		throw error;
	}

	return stdout
		.split("\n")
		.filter(Boolean)
		.map((entry) => ({
			name: entry.endsWith("/") ? entry.slice(0, -1) : entry,
			isDirectory: entry.endsWith("/"),
		}))
		.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) {
				return a.isDirectory ? -1 : 1;
			}
			return a.name.localeCompare(b.name);
		});
};

export const readContainerFile = async (
	containerId: string,
	filePath: string,
	serverId?: string,
) => {
	const command = `docker exec ${quote([containerId])} cat ${quote([filePath])} | head -c ${CONTAINER_FILE_SIZE_LIMIT + 1} | base64 | tr -d '\\n'`;
	const { stdout, stderr } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);

	if (stderr && !stdout) {
		if (stderr.includes("executable file not found")) {
			throw new Error(NO_SHELL_UTILITIES_ERROR);
		}
		throw new Error(stderr);
	}

	const buffer = Buffer.from(stdout.trim(), "base64");
	return {
		content: buffer.subarray(0, CONTAINER_FILE_SIZE_LIMIT).toString("base64"),
		truncated: buffer.byteLength > CONTAINER_FILE_SIZE_LIMIT,
	};
};

export const writeContainerFile = async (
	containerId: string,
	filePath: string,
	content: string,
	serverId?: string,
) => {
	const base64Content = Buffer.from(content, "utf8").toString("base64");
	if (base64Content.length > CONTAINER_FILE_SIZE_LIMIT * 2) {
		throw new Error("File is too large to save from the editor (max 512KB)");
	}

	const tempPath = `/tmp/dokploy-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const command = `printf '%s' ${quote([base64Content])} | base64 -d > ${quote([tempPath])} && docker cp ${quote([tempPath])} ${quote([`${containerId}:${filePath}`])}; status=$?; rm -f ${quote([tempPath])}; exit $status`;

	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};

export const deleteContainerFile = async (
	containerId: string,
	path: string,
	serverId?: string,
) => {
	const command = `docker exec ${quote([containerId])} rm -rf ${quote([path])}`;

	try {
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	} catch (error) {
		if (isMissingBinaryError(error)) {
			throw new Error(NO_SHELL_UTILITIES_ERROR);
		}
		throw error;
	}
};

export interface DockerEvent {
	Type?: string;
	Action?: string;
	Actor?: {
		ID?: string;
		Attributes?: Record<string, string>;
	};
	time?: number;
}

export const getDockerEvents = async (
	serverId?: string | null,
	minutes = 15,
) => {
	const until = new Date();
	const since = new Date(until.getTime() - minutes * 60 * 1000);
	const command = `docker events --since ${quote([since.toISOString()])} --until ${quote([until.toISOString()])} --format '{{json .}}'`;

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
	}

	const events: DockerEvent[] = stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line) as DockerEvent;
			} catch {
				return null;
			}
		})
		.filter((event): event is DockerEvent => event !== null)
		.reverse();

	return {
		events,
		fetchedAt: until.toISOString(),
	};
};
