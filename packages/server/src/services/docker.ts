import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";

const parseDockerHumanSizeToBytes = (sizeStr: string): number => {
	if (!sizeStr) return 0;
	const [numStr, unitRaw] = sizeStr.split(" ");
	const num = Number.parseFloat(numStr || "0");
	const unit = (unitRaw || "").toUpperCase();
	switch (unit) {
		case "B":
			return num;
		case "KB":
			return num * 1024;
		case "MB":
			return num * 1024 * 1024;
		case "GB":
			return num * 1024 * 1024 * 1024;
		case "TB":
			return num * 1024 * 1024 * 1024 * 1024;
		default:
			return num; // fallback
	}
};

export type DockerDiskUsageBreakdown = {
	type: "Images" | "Containers" | "Local Volumes" | "Build Cache" | string;
	sizeBytes: number;
};

export const getDockerDiskUsageSummary = async (serverId?: string) => {
	try {
		const command = "docker system df --format '{{json .}}'";
		let stdout = "";
		let stderr = "";
		if (serverId) {
			const res = await execAsyncRemote(serverId, command);
			stdout = res.stdout;
			stderr = res.stderr;
		} else {
			const res = await execAsync(command);
			stdout = res.stdout;
			stderr = res.stderr;
		}
		if (stderr) {
			// Some docker versions may still print warnings to stderr; we only bail if no stdout
			if (!stdout) {
				throw new Error(stderr);
			}
		}

		const lines = stdout.trim().split("\n").filter(Boolean);
		const parsed: DockerDiskUsageBreakdown[] = lines.map((line) => {
			try {
				const obj = JSON.parse(line);
				// Expected fields: Type, Size, Reclaimable, etc.
				const type = obj.Type as string;
				const sizeStr = (obj.Size as string) || "0B";
				return { type, sizeBytes: parseDockerHumanSizeToBytes(sizeStr) };
			} catch {
				return { type: "Unknown", sizeBytes: 0 } as DockerDiskUsageBreakdown;
			}
		});

		// Aggregate by type (just in case duplicates appear)
		const aggregated = parsed.reduce<Record<string, number>>((acc, cur) => {
			acc[cur.type] = (acc[cur.type] || 0) + cur.sizeBytes;
			return acc;
		}, {});

		return Object.entries(aggregated).map(([type, sizeBytes]) => ({
			type,
			sizeBytes,
		}));
	} catch (e) {
		return [] as DockerDiskUsageBreakdown[];
	}
};

export type DiskBreakdownMode = "all" | "projects" | "services";

export const getDockerDiskUsageBreakdown = async (
	mode: DiskBreakdownMode,
	serverId?: string,
) => {
	try {
		// 1) Get detailed df including volumes sizes
		const dfCmd = "docker system df -v --format '{{json .}}'";
		const dfRes = serverId
			? await execAsyncRemote(serverId, dfCmd)
			: await execAsync(dfCmd);
		const dfLines = (dfRes.stdout || "").trim().split("\n").filter(Boolean);

		if (mode === "all") {
			// Reuse summary categories for 'all'
			return await getDockerDiskUsageSummary(serverId);
		}

		// Build volume size map from df -v
		const volumeSizeByName: Record<string, number> = {};
		for (const line of dfLines) {
			try {
				const obj = JSON.parse(line);
				const typeVal = String(obj.Type || obj.Resource || "");
				const nameVal = obj.Name || obj.Volume || obj.ID || obj.Ref || "";
				const sizeVal =
					obj.Size || obj.UsedSize || obj.Used || obj.Reclaimable || "0B";
				if (typeVal.toLowerCase().includes("volume") && nameVal) {
					const size = parseDockerHumanSizeToBytes(
						String(sizeVal).split("(")[0].trim(),
					);
					volumeSizeByName[String(nameVal)] = size;
				}
			} catch {}
		}

		// 2) Inspect all volumes to get labels for attribution (compose project/service or stack namespace)
		// This is done in a single command to avoid multiple execs
		const inspectCmd = "docker volume inspect $(docker volume ls -q)";
		const inspectRes = serverId
			? await execAsyncRemote(serverId, inspectCmd)
			: await execAsync(inspectCmd);

		const volumes = (() => {
			try {
				const parsed = JSON.parse(inspectRes.stdout || "[]");
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				return [] as Array<any>;
			}
		})();

		const grouping: Record<string, number> = {};
		for (const v of volumes) {
			const name: string = v?.Name || "";
			const size = volumeSizeByName[name] || 0;
			if (size <= 0) continue;
			const labels = v?.Labels || {};

			const composeProject: string | undefined =
				labels["com.docker.compose.project"];
			const composeService: string | undefined =
				labels["com.docker.compose.service"];
			const stackNs: string | undefined = labels["com.docker.stack.namespace"];

			let key = "Unattributed";
			if (mode === "projects") {
				key = composeProject || stackNs || "Unattributed";
			} else if (mode === "services") {
				key = composeService || composeProject || stackNs || "Unattributed";
			}

			grouping[key] = (grouping[key] || 0) + size;
		}

		// 3) Also include container writable layer sizes grouped by labels
		const psCmd = "docker ps -a --size --format '{{json .}}'";
		const psRes = serverId
			? await execAsyncRemote(serverId, psCmd)
			: await execAsync(psCmd);
		const containerLines = (psRes.stdout || "")
			.trim()
			.split("\n")
			.filter(Boolean);

		const containerIds: string[] = [];
		const containerSizes: Record<string, number> = {};
		for (const line of containerLines) {
			try {
				const obj = JSON.parse(line);
				const id = obj.ID || obj.Id || obj.Container || "";
				const sizeStr = (obj.Size as string) || ""; // e.g., "10.5MB (virtual 120MB)"
				const sizeParsed = parseDockerHumanSizeToBytes(
					sizeStr.split("(")[0].trim(),
				);
				if (id) {
					containerIds.push(id);
					containerSizes[id] = sizeParsed;
				}
			} catch {}
		}

		if (containerIds.length > 0) {
			const inspectContainersCmd = `docker inspect ${containerIds.join(" ")}`;
			const inspRes = serverId
				? await execAsyncRemote(serverId, inspectContainersCmd)
				: await execAsync(inspectContainersCmd);
			const containers = (() => {
				try {
					const parsed = JSON.parse(inspRes.stdout || "[]");
					return Array.isArray(parsed) ? parsed : [];
				} catch {
					return [] as Array<any>;
				}
			})();

			for (const c of containers) {
				const id: string = c?.Id || c?.ID || "";
				const labels = c?.Config?.Labels || {};
				const size = containerSizes[id] || 0;
				if (size <= 0) continue;
				const composeProject: string | undefined =
					labels["com.docker.compose.project"];
				const composeService: string | undefined =
					labels["com.docker.compose.service"];
				const stackNs: string | undefined =
					labels["com.docker.stack.namespace"];

				let key = "Unattributed";
				if (mode === "projects") {
					key = composeProject || stackNs || "Unattributed";
				} else if (mode === "services") {
					key = composeService || composeProject || stackNs || "Unattributed";
				}
				grouping[key] = (grouping[key] || 0) + size;
			}
		}

		return Object.entries(grouping)
			.map(([type, sizeBytes]) => ({ type, sizeBytes }))
			.sort((a, b) => b.sizeBytes - a.sizeBytes);
	} catch (e) {
		return [] as DockerDiskUsageBreakdown[];
	}
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
			"docker ps -a --format 'CONTAINER ID : {{.ID}} | Name: {{.Names}} | State: {{.State}}'";

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

export const getStackContainersByAppName = async (
	appName: string,
	serverId?: string,
) => {
	try {
		let result: string[] = [];

		const command = `docker stack ps ${appName} --format 'CONTAINER ID : {{.ID}} | Name: {{.Name}} | State: {{.DesiredState}} | Node: {{.Node}}'`;
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
			return {
				containerId,
				name,
				state,
				node,
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

		const command = `docker service ps ${appName} --format 'CONTAINER ID : {{.ID}} | Name: {{.Name}} | State: {{.DesiredState}} | Node: {{.Node}}'`;

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
			return {
				containerId,
				name,
				state,
				node,
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
	} catch {}
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

		const appArray = stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((service) => !service.Name.startsWith("dokploy-"));

		return appArray;
	} catch {}
};

export const getApplicationInfo = async (
	appNames: string[],
	serverId?: string,
) => {
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

		const appArray = stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		return appArray;
	} catch {}
};
