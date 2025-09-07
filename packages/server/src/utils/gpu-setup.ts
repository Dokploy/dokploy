import * as fs from "node:fs/promises";
import { execAsync, execAsyncRemote, sleep } from "../utils/process/execAsync";

interface GPUInfo {
	driverInstalled: boolean;
	driverVersion?: string;
	gpuModel?: string;
	runtimeInstalled: boolean;
	runtimeConfigured: boolean;
	cudaSupport: boolean;
	cudaVersion?: string;
	memoryInfo?: string;
	availableGPUs: number;
	swarmEnabled: boolean;
	gpuResources: number;
}

export async function checkGPUStatus(serverId?: string): Promise<GPUInfo> {
	try {
		const [driverInfo, runtimeInfo, swarmInfo, gpuInfo, cudaInfo] =
			await Promise.all([
				checkGpuDriver(serverId),
				checkRuntime(serverId),
				checkSwarmResources(serverId),
				checkGpuInfo(serverId),
				checkCudaSupport(serverId),
			]);

		return {
			...driverInfo,
			...runtimeInfo,
			...swarmInfo,
			...gpuInfo,
			...cudaInfo,
		};
	} catch {
		return {
			driverInstalled: false,
			driverVersion: undefined,
			runtimeInstalled: false,
			runtimeConfigured: false,
			cudaSupport: false,
			cudaVersion: undefined,
			gpuModel: undefined,
			memoryInfo: undefined,
			availableGPUs: 0,
			swarmEnabled: false,
			gpuResources: 0,
		};
	}
}

const checkGpuDriver = async (serverId?: string) => {
	let driverVersion: string | undefined;
	let driverInstalled = false;
	let availableGPUs = 0;

	try {
		const driverCommand =
			"nvidia-smi --query-gpu=driver_version --format=csv,noheader";
		const { stdout: nvidiaSmi } = serverId
			? await execAsyncRemote(serverId, driverCommand)
			: await execAsync(driverCommand);

		driverVersion = nvidiaSmi.trim();
		if (driverVersion) {
			driverInstalled = true;
			const countCommand =
				"nvidia-smi --query-gpu=gpu_name --format=csv,noheader | wc -l";
			const { stdout: gpuCount } = serverId
				? await execAsyncRemote(serverId, countCommand)
				: await execAsync(countCommand);

			availableGPUs = Number.parseInt(gpuCount.trim(), 10);
		}
	} catch (error) {
		console.debug("GPU driver check:", error);
	}

	return { driverVersion, driverInstalled, availableGPUs };
};

const checkRuntime = async (serverId?: string) => {
	let runtimeInstalled = false;
	let runtimeConfigured = false;

	try {
		// First check: Is nvidia-container-runtime installed?
		const checkBinaryCommand = "command -v nvidia-container-runtime";
		try {
			const { stdout } = serverId
				? await execAsyncRemote(serverId, checkBinaryCommand)
				: await execAsync(checkBinaryCommand);
			runtimeInstalled = !!stdout.trim();
		} catch (error) {
			console.debug("Runtime binary check:", error);
		}

		// Second check: Is it configured in Docker?
		try {
			const runtimeCommand = 'docker info --format "{{json .Runtimes}}"';
			const { stdout: runtimeInfo } = serverId
				? await execAsyncRemote(serverId, runtimeCommand)
				: await execAsync(runtimeCommand);

			const defaultCommand = 'docker info --format "{{.DefaultRuntime}}"';
			const { stdout: defaultRuntime } = serverId
				? await execAsyncRemote(serverId, defaultCommand)
				: await execAsync(defaultCommand);

			const runtimes = JSON.parse(runtimeInfo);
			const hasNvidiaRuntime = "nvidia" in runtimes;
			const isDefaultRuntime = defaultRuntime.trim() === "nvidia";

			// Only set runtimeConfigured if both conditions are met
			runtimeConfigured = hasNvidiaRuntime && isDefaultRuntime;
		} catch (error) {
			console.debug("Runtime configuration check:", error);
		}
	} catch (error) {
		console.debug("Runtime check:", error);
	}

	return { runtimeInstalled, runtimeConfigured };
};

const checkSwarmResources = async (serverId?: string) => {
	let swarmEnabled = false;
	let gpuResources = 0;

	try {
		const nodeCommand =
			"docker node inspect self --format '{{json .Description.Resources.GenericResources}}'";
		const { stdout: resources } = serverId
			? await execAsyncRemote(serverId, nodeCommand)
			: await execAsync(nodeCommand);

		if (resources && resources !== "null") {
			const genericResources = JSON.parse(resources);
			for (const resource of genericResources) {
				if (
					resource.DiscreteResourceSpec &&
					(resource.DiscreteResourceSpec.Kind === "GPU" ||
						resource.DiscreteResourceSpec.Kind === "gpu")
				) {
					gpuResources = resource.DiscreteResourceSpec.Value;
					swarmEnabled = true;
					break;
				}
			}
		}
	} catch (error) {
		console.debug("Swarm resource check:", error);
	}

	return { swarmEnabled, gpuResources };
};

const checkGpuInfo = async (serverId?: string) => {
	let gpuModel: string | undefined;
	let memoryInfo: string | undefined;

	try {
		const gpuInfoCommand =
			"nvidia-smi --query-gpu=gpu_name,memory.total --format=csv,noheader";
		const { stdout: gpuInfo } = serverId
			? await execAsyncRemote(serverId, gpuInfoCommand)
			: await execAsync(gpuInfoCommand);

		[gpuModel, memoryInfo] = gpuInfo.split(",").map((s) => s.trim());
	} catch (error) {
		console.debug("GPU info check:", error);
	}

	return { gpuModel, memoryInfo };
};

const checkCudaSupport = async (serverId?: string) => {
	let cudaVersion: string | undefined;
	let cudaSupport = false;

	try {
		const cudaCommand = 'nvidia-smi -q | grep "CUDA Version"';
		const { stdout: cudaInfo } = serverId
			? await execAsyncRemote(serverId, cudaCommand)
			: await execAsync(cudaCommand);

		const cudaMatch = cudaInfo.match(/CUDA Version\s*:\s*([\d.]+)/);
		cudaVersion = cudaMatch ? cudaMatch[1] : undefined;
		cudaSupport = !!cudaVersion;
	} catch (error) {
		console.debug("CUDA support check:", error);
	}

	return { cudaVersion, cudaSupport };
};

export async function setupGPUSupport(serverId?: string): Promise<void> {
	try {
		// 1. Initial status check and validation
		const initialStatus = await checkGPUStatus(serverId);
		const shouldContinue = await validatePrerequisites(initialStatus);
		if (!shouldContinue) return;

		// 2. Get node ID
		const nodeId = await getNodeId(serverId);

		// 3. Create daemon configuration
		const daemonConfig = createDaemonConfig(initialStatus.availableGPUs);

		// 4. Setup server based on environment
		if (serverId) {
			await setupRemoteServer(serverId, daemonConfig);
		} else {
			await setupLocalServer(daemonConfig);
		}

		// 5. Wait for Docker restart
		await sleep(10000);

		// 6. Add GPU label
		await addGpuLabel(nodeId, serverId);

		// 7. Final verification
		await sleep(5000);
		await verifySetup(nodeId, serverId);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("password is required")
		) {
			throw new Error(
				"Sudo access required. Please run with appropriate permissions.",
			);
		}
		throw error;
	}
}

const validatePrerequisites = async (initialStatus: GPUInfo) => {
	if (!initialStatus.driverInstalled) {
		throw new Error(
			"NVIDIA drivers not installed. Please install appropriate NVIDIA drivers first.",
		);
	}

	if (!initialStatus.runtimeInstalled) {
		throw new Error(
			"NVIDIA Container Runtime not installed. Please install nvidia-container-runtime first.",
		);
	}

	if (initialStatus.swarmEnabled && initialStatus.runtimeConfigured) {
		return false;
	}

	return true;
};

const getNodeId = async (serverId?: string) => {
	const nodeIdCommand = 'docker info --format "{{.Swarm.NodeID}}"';
	const { stdout: nodeId } = serverId
		? await execAsyncRemote(serverId, nodeIdCommand)
		: await execAsync(nodeIdCommand);

	const trimmedNodeId = nodeId.trim();
	if (!trimmedNodeId) {
		throw new Error("Setup Server before enabling GPU support");
	}

	return trimmedNodeId;
};

const createDaemonConfig = (availableGPUs: number) => ({
	runtimes: {
		nvidia: {
			path: "nvidia-container-runtime",
			runtimeArgs: [],
		},
	},
	"default-runtime": "nvidia",
	"node-generic-resources": [`GPU=${availableGPUs}`],
});

const setupRemoteServer = async (serverId: string, daemonConfig: any) => {
	const setupCommands = [
		"sudo -n true",
		`echo '${JSON.stringify(daemonConfig, null, 2)}' | sudo tee /etc/docker/daemon.json`,
		"sudo mkdir -p /etc/nvidia-container-runtime",
		'sudo sed -i "/swarm-resource/d" /etc/nvidia-container-runtime/config.toml',
		'echo "swarm-resource = \\"DOCKER_RESOURCE_GPU\\"" | sudo tee -a /etc/nvidia-container-runtime/config.toml',
		"sudo systemctl daemon-reload",
		"sudo systemctl restart docker",
	].join(" && ");

	await execAsyncRemote(serverId, setupCommands);
};

const setupLocalServer = async (daemonConfig: any) => {
	const configFile = `/tmp/docker-daemon-${Date.now()}.json`;
	await fs.writeFile(configFile, JSON.stringify(daemonConfig, null, 2));

	const setupCommands = [
		`sudo sh -c '
			cp ${configFile} /etc/docker/daemon.json && 
			mkdir -p /etc/nvidia-container-runtime && 
			sed -i "/swarm-resource/d" /etc/nvidia-container-runtime/config.toml &&
			echo "swarm-resource = \\"DOCKER_RESOURCE_GPU\\"" >> /etc/nvidia-container-runtime/config.toml && 
			systemctl daemon-reload && 
			systemctl restart docker
		'`,
		`rm ${configFile}`,
	].join(" && ");

	try {
		await execAsync(setupCommands);
	} catch {
		throw new Error(
			"Failed to configure GPU support. Please ensure you have sudo privileges and try again.",
		);
	}
};

const addGpuLabel = async (nodeId: string, serverId?: string) => {
	const labelCommand = `docker node update --label-add gpu=true ${nodeId}`;
	if (serverId) {
		await execAsyncRemote(serverId, labelCommand);
	} else {
		await execAsync(labelCommand);
	}
};

const verifySetup = async (nodeId: string, serverId?: string) => {
	const finalStatus = await checkGPUStatus(serverId);

	if (!finalStatus.swarmEnabled) {
		const diagnosticCommands = [
			`docker node inspect ${nodeId}`,
			'nvidia-smi -a | grep "GPU UUID"',
			"cat /etc/docker/daemon.json",
			"cat /etc/nvidia-container-runtime/config.toml",
		].join(" && ");

		await (serverId
			? execAsyncRemote(serverId, diagnosticCommands)
			: execAsync(diagnosticCommands));

		throw new Error("GPU support not detected in swarm after setup");
	}

	return finalStatus;
};
