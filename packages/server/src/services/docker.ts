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
			.filter((container) => !container.name.includes("dokploy"));

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
	} catch (error) {}
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
	} catch (error) {}

	return [];
};

export const getContainersByAppLabel = async (
	appName: string,
	serverId?: string,
) => {
	try {
		let stdout = "";
		let stderr = "";

		const command = `docker ps --filter "label=com.docker.swarm.service.name=${appName}" --format 'CONTAINER ID : {{.ID}} | Name: {{.Names}} | State: {{.State}}'`;
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
	} catch (error) {}

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
	} catch (error) {}
};
