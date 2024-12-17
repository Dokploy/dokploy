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

export const getSwarmNodes = async () => {
	try {
		const { stdout, stderr } = await execAsync(
			"docker node ls --format '{{json .}}'",
		);

		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		const nodes = JSON.parse(stdout);

		const nodesArray = stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		return nodesArray;
	} catch (error) {}
};

export const getNodeInfo = async (nodeId: string) => {
	try {
		const { stdout, stderr } = await execAsync(
			`docker node inspect ${nodeId} --format '{{json .}}'`,
		);

		if (stderr) {
			console.error(`Error: ${stderr}`);
			return;
		}

		const nodeInfo = JSON.parse(stdout);

		return nodeInfo;
	} catch (error) {}
};

export const getNodeApplications = async () => {
	try {
		// TODO: Implement this
		// const { stdout, stderr } = await execAsync(
		//   `docker service ls --format '{{json .}}'`
		// );

		const stdout = `{"ID":"pxvnj68dxom9","Image":"dokploy/dokploy:latest","Mode":"replicated","Name":"dokploy","Ports":"","Replicas":"1/1"}
{"ID":"1sweo6dr2vrn","Image":"postgres:16","Mode":"replicated","Name":"dokploy-postgres","Ports":"","Replicas":"1/1"}
{"ID":"tnl2fck3rbop","Image":"redis:7","Mode":"replicated","Name":"dokploy-redis","Ports":"","Replicas":"1/1"}
{"ID":"o9ady4y1p96x","Image":"traefik:v3.1.2","Mode":"replicated","Name":"dokploy-traefik","Ports":"","Replicas":"1/1"}
{"ID":"rsxe3l71h9y4","Image":"esports-manager-api-eg8t7w:latest","Mode":"replicated","Name":"esports-manager-api-eg8t7w","Ports":"","Replicas":"1/1"}
{"ID":"fw52vzcw5dc0","Image":"team-synix-admin-dvgspy:latest","Mode":"replicated","Name":"team-synix-admin-dvgspy","Ports":"","Replicas":"1/1"}
{"ID":"551bwmtd6b4t","Image":"team-synix-leaderboard-9vx8ca:latest","Mode":"replicated","Name":"team-synix-leaderboard-9vx8ca","Ports":"","Replicas":"1/1"}
{"ID":"h1eyg3g1tyn3","Image":"postgres:15","Mode":"replicated","Name":"team-synix-webpage-db-fkivnf","Ports":"","Replicas":"1/1"}`;

		// if (stderr) {
		//   console.error(`Error: ${stderr}`);
		//   return;
		// }

		const appArray = stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		console.log(appArray);
		return appArray;
	} catch (error) {}
};

export const getApplicationInfo = async (appName: string) => {
	try {
		// TODO: Implement this
		// const { stdout, stderr } = await execAsync(
		//   `docker service ps ${appName} --format '{{json .}}'`
		// );

		const stdout = `{"CurrentState":"Running 2 weeks ago","DesiredState":"Running","Error":"","ID":"nx8jxlmb8niw","Image":"postgres:16","Name":"dokploy-postgres.1","Node":"v2202411192718297480","Ports":""}
{"CurrentState":"Running 2 weeks ago","DesiredState":"Running","Error":"","ID":"s288g9lwtvi4","Image":"redis:7","Name":"dokploy-redis.1","Node":"v2202411192718297480","Ports":""}
{"CurrentState":"Running 2 weeks ago","DesiredState":"Running","Error":"","ID":"2vcmejz51b23","Image":"traefik:v3.1.2","Name":"dokploy-traefik.1","Node":"v2202411192718297480","Ports":"*:80-\u003e80/tcp,*:80-\u003e80/tcp,*:443-\u003e443/tcp,*:443-\u003e443/tcp"}
{"CurrentState":"Running 26 hours ago","DesiredState":"Running","Error":"","ID":"79iatnbsm2um","Image":"dokploy/dokploy:latest","Name":"dokploy.1","Node":"v2202411192718297480","Ports":"*:3000-\u003e3000/tcp,*:3000-\u003e3000/tcp"}
{"CurrentState":"Shutdown 26 hours ago","DesiredState":"Shutdown","Error":"","ID":"zcwxs501zs7w","Image":"dokploy/dokploy:latest","Name":"dokploy.1","Node":"v2202411192718297480","Ports":""}
{"CurrentState":"Shutdown 7 days ago","DesiredState":"Shutdown","Error":"","ID":"t59qhkoenno4","Image":"dokploy/dokploy:latest","Name":"dokploy.1","Node":"v2202411192718297480","Ports":""}
{"CurrentState":"Shutdown 7 days ago","DesiredState":"Shutdown","Error":"","ID":"o5xtcuj6um7e","Image":"dokploy/dokploy:latest","Name":"dokploy.1","Node":"v2202411192718297480","Ports":""}
{"CurrentState":"Running 2 weeks ago","DesiredState":"Running","Error":"","ID":"q1lr9rmf452g","Image":"esports-manager-api-eg8t7w:latest","Name":"esports-manager-api-eg8t7w.1","Node":"v2202411192718297480","Ports":""}
{"CurrentState":"Shutdown 2 weeks ago","DesiredState":"Shutdown","Error":"","ID":"y9ixpg6b8qdo","Image":"esports-manager-api-eg8t7w:latest","Name":"esports-manager-api-eg8t7w.1","Node":"v2202411192718297480","Ports":""}
{"CurrentState":"Running 24 hours ago","DesiredState":"Running","Error":"","ID":"xgcb919qjg1a","Image":"team-synix-admin-dvgspy:latest","Name":"team-synix-admin-dvgspy.1","Node":"v2202411192718297480","Ports":""}
{"CurrentState":"Running 26 hours ago","DesiredState":"Running","Error":"","ID":"7yi95wh8zhh6","Image":"team-synix-leaderboard-9vx8ca:latest","Name":"team-synix-leaderboard-9vx8ca.1","Node":"v2202411192718297480","Ports":""}
{"CurrentState":"Running 2 weeks ago","DesiredState":"Running","Error":"","ID":"89yzsnghpbq6","Image":"postgres:15","Name":"team-synix-webpage-db-fkivnf.1","Node":"v2202411192718297480","Ports":""}`;

		// if (stderr) {
		//   console.error(`Error: ${stderr}`);
		//   return;
		// }

		const appArray = stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		return appArray;
	} catch (error) {}
};
