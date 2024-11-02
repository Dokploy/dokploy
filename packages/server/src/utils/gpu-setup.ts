import { execAsync } from "../utils/process/execAsync";
import { execAsyncRemote } from "../utils/process/execAsync";

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
		// Check NVIDIA Driver
		let driverInstalled = false;
		let driverVersion: string | undefined;
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

		// Check Runtime Configuration
		let runtimeInstalled = false;
		let runtimeConfigured = false;
		try {
			const runtimeCommand = 'docker info --format "{{json .Runtimes}}"';
			const { stdout: runtimeInfo } = serverId
				? await execAsyncRemote(serverId, runtimeCommand)
				: await execAsync(runtimeCommand);

			const runtimes = JSON.parse(runtimeInfo);
			runtimeInstalled = "nvidia" in runtimes;

			// Check if it's the default runtime
			const defaultCommand = 'docker info --format "{{.DefaultRuntime}}"';
			const { stdout: defaultRuntime } = serverId
				? await execAsyncRemote(serverId, defaultCommand)
				: await execAsync(defaultCommand);

			runtimeConfigured = defaultRuntime.trim() === "nvidia";
		} catch (error) {
			console.debug("Runtime check:", error);
		}

		// Check Swarm GPU Resources
		let swarmEnabled = false;
		let gpuResources = 0;

		try {
			// Check node resources directly from inspect
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

		// Get GPU Model and Memory Info
		const gpuInfoCommand =
			"nvidia-smi --query-gpu=gpu_name,memory.total --format=csv,noheader";
		const { stdout: gpuInfo } = serverId
			? await execAsyncRemote(serverId, gpuInfoCommand)
			: await execAsync(gpuInfoCommand);

		const [gpuModel, memoryTotal] = gpuInfo.split(",").map((s) => s.trim());

		// Check CUDA Support
		const cudaCommand = 'nvidia-smi -q | grep "CUDA Version"';
		const { stdout: cudaInfo } = serverId
			? await execAsyncRemote(serverId, cudaCommand)
			: await execAsync(cudaCommand);

		const cudaMatch = cudaInfo.match(/CUDA Version\s*:\s*([\d\.]+)/);
		const cudaVersion = cudaMatch ? cudaMatch[1] : undefined;
		const cudaSupport = !!cudaVersion;

		return {
			driverInstalled,
			driverVersion,
			runtimeInstalled,
			runtimeConfigured,
			availableGPUs,
			swarmEnabled,
			gpuResources,
			gpuModel,
			memoryInfo: memoryTotal,
			cudaSupport,
			cudaVersion,
		};
	} catch (error) {
		console.error("Error in checkGPUStatus:", error);
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

export async function setupGPUSupport(serverId?: string): Promise<void> {
	try {
		// 1. Check current GPU status first
		const initialStatus = await checkGPUStatus(serverId);

		// If GPU is already configured, just verify and return quickly
		if (
			initialStatus.swarmEnabled &&
			initialStatus.runtimeConfigured &&
			initialStatus.driverInstalled
		) {
			console.log("GPU already configured, skipping setup");
			return;
		}

		// 2. Verify GPU prerequisites
		if (!initialStatus.driverInstalled || !initialStatus.runtimeInstalled) {
			throw new Error(
				"NVIDIA drivers or runtime not installed. Please install them first.",
			);
		}

		// Get the node ID
		const nodeIdCommand = 'docker info --format "{{.Swarm.NodeID}}"';
		const { stdout: nodeId } = serverId
			? await execAsyncRemote(serverId, nodeIdCommand)
			: await execAsync(nodeIdCommand);

		if (!nodeId.trim()) {
			throw new Error("Setup Server before enabling GPU support");
		}

		// 3. Configure NVIDIA runtime in daemon.json
		const daemonConfig = {
			runtimes: {
				nvidia: {
					path: "nvidia-container-runtime",
					runtimeArgs: [],
				},
			},
			"default-runtime": "nvidia",
			"node-generic-resources": [`GPU=${initialStatus.availableGPUs}`],
		};

		const setupCommands = [
			"sudo -n true",
			`echo '${JSON.stringify(daemonConfig, null, 2)}' | sudo tee /etc/docker/daemon.json`,
			"sudo mkdir -p /etc/nvidia-container-runtime",
			'echo "swarm-resource = \\"DOCKER_RESOURCE_GPU\\"" | sudo tee -a /etc/nvidia-container-runtime/config.toml',
			"sudo systemctl daemon-reload",
			"sudo systemctl restart docker",
		].join(" && ");

		if (serverId) {
			await execAsyncRemote(serverId, setupCommands);
		} else {
			await execAsync(setupCommands);
		}

		// 4. Reduced wait time for Docker restart
		await new Promise((resolve) => setTimeout(resolve, 10000));

		// 5. Add GPU label to the node
		const labelCommand = `docker node update --label-add gpu=true ${nodeId.trim()}`;
		if (serverId) {
			await execAsyncRemote(serverId, labelCommand);
		} else {
			await execAsync(labelCommand);
		}

		// 6. Quick final verification
		await new Promise((resolve) => setTimeout(resolve, 5000));
		const finalStatus = await checkGPUStatus(serverId);

		if (!finalStatus.swarmEnabled) {
			const diagnosticCommands = [
				`docker node inspect ${nodeId.trim()}`,
				'nvidia-smi -a | grep "GPU UUID"',
				"cat /etc/docker/daemon.json",
				"cat /etc/nvidia-container-runtime/config.toml",
			].join(" && ");

			const { stdout: diagnostics } = serverId
				? await execAsyncRemote(serverId, diagnosticCommands)
				: await execAsync(diagnosticCommands);

			console.error("Diagnostic Information:", diagnostics);
			throw new Error("GPU support not detected in swarm after setup");
		}

		console.log("GPU setup completed successfully:", {
			availableGPUs: initialStatus.availableGPUs,
			driverVersion: initialStatus.driverVersion,
			nodeId: nodeId.trim(),
		});
	} catch (error) {
		console.error("GPU Setup Error:", error);
		throw error;
	}
}
