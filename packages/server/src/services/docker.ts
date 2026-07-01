import { quoteShellArg } from "@dokploy/server/utils/filesystem/safe-path";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";

const dockerNodeIdentifierRegex = /^[a-zA-Z0-9._-]+$/;

const normalizeDockerNodeIdentifier = (nodeId: string) => {
	if (!nodeId || !dockerNodeIdentifierRegex.test(nodeId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid Docker node identifier",
		});
	}

	return nodeId;
};

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
			`docker ps -q --filter ${quoteShellArg(`name=^${appNameOrId}`)} | head -1`,
		);
		const containerId = findResult.stdout.trim();

		if (!containerId) {
			// Fallback: try as a swarm service
			const svcResult = await exec(
				`docker service ls -q --filter ${quoteShellArg(`name=${appNameOrId}`)} | head -1`,
			);
			const serviceId = svcResult.stdout.trim();
			if (!serviceId) {
				throw new Error(`No container or service found for: ${appNameOrId}`);
			}
			target = serviceId;
			isService = true;
		} else {
			target = containerId;
		}
	}

	const sinceFlag = since === "all" ? "" : `--since ${since}`;
	const quotedTarget = quoteShellArg(target);
	const baseCommand = isService
		? `docker service logs --timestamps --raw --tail ${tail} ${sinceFlag} ${quotedTarget}`
		: `docker container logs --timestamps --tail ${tail} ${sinceFlag} ${quotedTarget}`;

	const command = search
		? `${baseCommand} 2>&1 | grep -iF ${quoteShellArg(search)}`
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
	const safeNodeId = quoteShellArg(normalizeDockerNodeIdentifier(nodeId));

	try {
		const command = `docker node inspect ${safeNodeId} --format '{{json .}}'`;
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

const parseDockerLabels = (
	labels: Record<string, string> | string | null | undefined,
) => {
	if (!labels) {
		return {};
	}

	if (typeof labels !== "string") {
		return labels;
	}

	return labels
		.split(",")
		.reduce<Record<string, string>>((accumulator, label) => {
			const separatorIndex = label.indexOf("=");
			if (separatorIndex <= 0) {
				return accumulator;
			}

			const key = label.slice(0, separatorIndex).trim();
			const value = label.slice(separatorIndex + 1).trim();
			if (key && value) {
				accumulator[key] = value;
			}
			return accumulator;
		}, {});
};

export const getAllContainerStats = async (serverId?: string) => {
	try {
		const statsCommand =
			'docker stats --no-stream --format \'{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}\'';
		const sizeCommand =
			'docker ps --size --format \'{"ID":"{{.ID}}","Name":"{{.Names}}","Size":"{{.Size}}","Labels":{{json .Labels}}}\'';

		let statsStdout = "";
		let sizeStdout = "";
		if (serverId) {
			const statsResult = await execAsyncRemote(serverId, statsCommand);
			const sizeResult = await execAsyncRemote(serverId, sizeCommand);
			statsStdout = statsResult.stdout;
			sizeStdout = sizeResult.stdout;
		} else {
			const statsResult = await execAsync(statsCommand);
			const sizeResult = await execAsync(sizeCommand);
			statsStdout = statsResult.stdout;
			sizeStdout = sizeResult.stdout;
		}

		if (!statsStdout.trim()) {
			return [];
		}

		const metadataByContainerId = new Map<
			string,
			{ labels: Record<string, string>; size: string }
		>();
		if (sizeStdout.trim()) {
			const sizes = sizeStdout
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));

			for (const size of sizes) {
				metadataByContainerId.set(size.ID, {
					labels: parseDockerLabels(size.Labels),
					size: size.Size ?? "",
				});
			}
		}

		const stats = statsStdout
			.trim()
			.split("\n")
			.map((line) => {
				const stat = JSON.parse(line);
				const metadata = metadataByContainerId.get(stat.ID);
				return {
					...stat,
					Labels: metadata?.labels ?? {},
					Size: metadata?.size ?? "",
				};
			});

		return stats;
	} catch (error) {
		console.error("getAllContainerStats error:", error);
		return [];
	}
};

export interface DockerContainerProcess {
	command: string;
	cpuPercent: number;
	memoryPercent: number;
	pid: string;
	rssBytes: number;
}

export const parseDockerTopProcesses = (
	output: string,
): DockerContainerProcess[] => {
	const [, ...lines] = output.trim().split("\n");

	return lines
		.map((line) => {
			const match = line.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
			if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5]) {
				return null;
			}

			const cpuPercent = Number.parseFloat(match[2]);
			const memoryPercent = Number.parseFloat(match[3]);
			const rssKb = Number.parseFloat(match[4]);

			return {
				command: match[5],
				cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : 0,
				memoryPercent: Number.isFinite(memoryPercent) ? memoryPercent : 0,
				pid: match[1],
				rssBytes: Number.isFinite(rssKb) ? rssKb * 1024 : 0,
			};
		})
		.filter((process): process is DockerContainerProcess => process !== null)
		.sort((a, b) => {
			if (b.cpuPercent !== a.cpuPercent) {
				return b.cpuPercent - a.cpuPercent;
			}
			return b.memoryPercent - a.memoryPercent;
		});
};

export const getContainerProcesses = async (
	containerId: string,
	serverId?: string,
) => {
	const containerIdRegex = /^[a-zA-Z0-9.\-_]+$/;
	if (!containerIdRegex.test(containerId)) {
		throw new Error("Invalid container ID");
	}

	try {
		const command = `docker top ${containerId} -eo pid,pcpu,pmem,rss,args`;
		const result = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		return parseDockerTopProcesses(result.stdout).slice(0, 20);
	} catch (error) {
		console.error("getContainerProcesses error:", error);
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
