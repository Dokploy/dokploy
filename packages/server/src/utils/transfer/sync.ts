import { execAsync, execAsyncRemote } from "../process/execAsync";
import type { ConflictDecision, MountTransferConfig } from "./types";

const execOnServer = async (
	serverId: string | null,
	command: string,
	onData?: (data: string) => void,
): Promise<{ stdout: string; stderr: string }> => {
	if (serverId) {
		return execAsyncRemote(serverId, command, onData);
	}
	return execAsync(command);
};

export const syncDirectory = async (
	sourceServerId: string | null,
	targetServerId: string,
	sourcePath: string,
	targetPath: string,
	onLog?: (message: string) => void,
): Promise<void> => {
	onLog?.(`Syncing directory: ${sourcePath} → ${targetPath}`);

	await execOnServer(targetServerId, `mkdir -p "${targetPath}"`);

	if (!sourceServerId && targetServerId) {
		// Local → Remote: use rsync over SSH
		const { stdout: sshKeyInfo } = await execAsyncRemote(
			targetServerId,
			"echo connected",
		);
		// Tar from local, pipe to remote via SSH
		await execAsync(
			`tar czf - -C "${sourcePath}" . 2>/dev/null | ssh -o StrictHostKeyChecking=no -i /tmp/transfer_key_${targetServerId} "tar xzf - -C ${targetPath}"`,
		).catch(async () => {
			// Fallback: read from local, write to remote via tar through dokploy
			const { stdout: tarData } = await execAsync(
				`tar czf - -C "${sourcePath}" . | base64`,
			);
			await execAsyncRemote(
				targetServerId,
				`echo "${tarData}" | base64 -d | tar xzf - -C "${targetPath}"`,
			);
		});
	} else if (sourceServerId && targetServerId) {
		// Remote → Remote: tar pipeline through Dokploy server
		onLog?.("Using tar pipeline for remote-to-remote transfer...");
		const { stdout: tarData } = await execAsyncRemote(
			sourceServerId,
			`tar czf - -C "${sourcePath}" . | base64`,
		);
		await execAsyncRemote(
			targetServerId,
			`echo "${tarData}" | base64 -d | tar xzf - -C "${targetPath}"`,
		);
	} else if (sourceServerId && !targetServerId) {
		// Remote → Local
		const { stdout: tarData } = await execAsyncRemote(
			sourceServerId,
			`tar czf - -C "${sourcePath}" . | base64`,
		);
		await execAsync(
			`echo "${tarData}" | base64 -d | tar xzf - -C "${targetPath}"`,
		);
	}

	onLog?.(`Directory synced successfully: ${targetPath}`);
};

export const syncDockerVolume = async (
	sourceServerId: string | null,
	targetServerId: string,
	volumeName: string,
	onLog?: (message: string) => void,
): Promise<void> => {
	onLog?.(`Syncing Docker volume: ${volumeName}`);

	await execOnServer(
		targetServerId,
		`docker volume inspect ${volumeName} > /dev/null 2>&1 || docker volume create ${volumeName}`,
	);

	// Export volume from source as tar
	const exportCommand = `docker run --rm -v ${volumeName}:/volume alpine tar czf - -C /volume . | base64`;
	let tarData: string;

	if (sourceServerId) {
		const result = await execAsyncRemote(sourceServerId, exportCommand);
		tarData = result.stdout;
	} else {
		const result = await execAsync(exportCommand);
		tarData = result.stdout;
	}

	// Import volume on target
	const importCommand = `echo "${tarData}" | base64 -d | docker run --rm -i -v ${volumeName}:/volume alpine tar xzf - -C /volume`;

	await execOnServer(targetServerId, importCommand);
	onLog?.(`Volume synced successfully: ${volumeName}`);
};

export const syncMount = async (
	sourceServerId: string | null,
	targetServerId: string,
	mount: MountTransferConfig,
	_decisions: Record<string, ConflictDecision>,
	onLog?: (message: string) => void,
): Promise<void> => {
	if (mount.type === "volume" && mount.volumeName) {
		await syncDockerVolume(
			sourceServerId,
			targetServerId,
			mount.volumeName,
			onLog,
		);
	} else if (mount.type === "bind" && mount.hostPath) {
		await syncDirectory(
			sourceServerId,
			targetServerId,
			mount.hostPath,
			mount.hostPath,
			onLog,
		);
	} else if (mount.type === "file" && mount.content) {
		onLog?.(`Syncing file mount: ${mount.mountPath}`);
		// File mounts are stored in the database, they get created during deploy
		// No file transfer needed, the content is in the DB
		onLog?.("File mount will be recreated from database content during deploy");
	}
};

export const syncTraefikConfig = async (
	sourceServerId: string | null,
	targetServerId: string,
	appName: string,
	onLog?: (message: string) => void,
): Promise<void> => {
	onLog?.(`Syncing Traefik config for: ${appName}`);

	const configPath = "/etc/dokploy/traefik/dynamic";
	const configFile = `${configPath}/${appName}.yml`;

	let configContent: string;
	if (sourceServerId) {
		const { stdout } = await execAsyncRemote(
			sourceServerId,
			`cat "${configFile}" 2>/dev/null || echo ""`,
		);
		configContent = stdout;
	} else {
		const { stdout } = await execAsync(
			`cat "${configFile}" 2>/dev/null || echo ""`,
		);
		configContent = stdout;
	}

	if (!configContent.trim()) {
		onLog?.("No Traefik config found on source, skipping");
		return;
	}

	await execOnServer(targetServerId, `mkdir -p "${configPath}"`);

	const escapedContent = configContent.replace(/'/g, "'\\''");
	await execOnServer(
		targetServerId,
		`echo '${escapedContent}' > "${configFile}"`,
	);

	onLog?.("Traefik config synced successfully");
};
