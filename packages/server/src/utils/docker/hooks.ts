import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRemoteDocker } from "../servers/remote-docker";
import { encodeBase64, getServiceContainer } from "./utils";

export type DeployHookKind = "pre" | "post";

export interface DeployHooks {
	pre?: string | null;
	post?: string | null;
}

export const parseDeployHooks = (
	raw: string | null | undefined,
): DeployHooks => {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") {
			return {
				pre: typeof parsed.pre === "string" ? parsed.pre : null,
				post: typeof parsed.post === "string" ? parsed.post : null,
			};
		}
	} catch {
		/* ignore malformed payload — treat as no hooks */
	}
	return {};
};

interface WaitOptions {
	timeoutMs?: number;
	intervalMs?: number;
}

// Polls a swarm service until a task reaches `State: running` and returns that
// task's container ID. Returning the resolved container ID directly avoids
// racing against `listContainers` during `start-first` rolling updates, where
// both the old and new task briefly share the service label.
export const waitForSwarmServiceRunning = async (
	appName: string,
	serverId: string | null | undefined,
	{ timeoutMs = 120_000, intervalMs = 2_000 }: WaitOptions = {},
): Promise<string> => {
	const deadline = Date.now() + timeoutMs;
	const remoteDocker = await getRemoteDocker(serverId);

	let lastError: string | undefined;

	while (Date.now() < deadline) {
		try {
			const service = remoteDocker.getService(appName);
			const info = await service.inspect();
			const replicas = info.Spec?.Mode?.Replicated?.Replicas ?? 1;

			if (replicas > 0) {
				const tasks = await remoteDocker.listTasks({
					filters: JSON.stringify({
						service: [appName],
						"desired-state": ["running"],
					}),
				});
				const runningTask = tasks.find((t) => t.Status?.State === "running");
				const containerId = runningTask?.Status?.ContainerStatus?.ContainerID;
				if (runningTask && containerId) return containerId;
				if (runningTask && !containerId) {
					lastError = "Running task has no container id yet";
				} else {
					const latestTask = tasks[0];
					lastError = `Service task state: ${latestTask?.Status?.State ?? "unknown"}`;
				}
			} else {
				lastError = "Service has 0 replicas";
			}
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}

		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	throw new Error(
		`Timed out after ${timeoutMs}ms waiting for swarm service "${appName}" to become healthy${
			lastError ? `: ${lastError}` : ""
		}`,
	);
};

interface RunDeployHookParams {
	kind: DeployHookKind;
	appName: string;
	serverId: string | null | undefined;
	command: string | null | undefined;
	logPath: string;
	// If provided, skip the label-based container lookup and exec against this
	// container id directly. Post-deploy uses this to target the exact task
	// that `waitForSwarmServiceRunning` observed as running, avoiding any
	// ambiguity when multiple tasks briefly share the service label.
	containerId?: string;
}

export const runDeployHook = async ({
	kind,
	appName,
	serverId,
	command,
	logPath,
	containerId,
}: RunDeployHookParams): Promise<void> => {
	const trimmed = command?.trim();
	if (!trimmed) return;

	let resolvedContainerId = containerId;
	if (!resolvedContainerId) {
		const container = await getServiceContainer(appName, serverId);
		if (!container) {
			if (kind === "pre") {
				const skipLine = `echo "===== No previous container found; skipping pre-deploy hook =====" >> "${logPath}"`;
				if (serverId) {
					await execAsyncRemote(serverId, skipLine);
				} else {
					await execAsync(skipLine);
				}
				return;
			}
			throw new Error(
				`post-deploy hook: no running container found for "${appName}"`,
			);
		}
		resolvedContainerId = container.Id;
	}

	const label = kind === "pre" ? "pre-deploy" : "post-deploy";
	const encoded = encodeBase64(trimmed);
	const scriptWrapper = `hook_cmd=$(echo "${encoded}" | base64 -d) && docker exec "${resolvedContainerId}" sh -c "$hook_cmd"`;
	const wrappedCommand = `(echo "===== Running ${label} hook (length=${trimmed.length} chars) =====" && ${scriptWrapper} && echo "===== ${label} hook finished =====") >> "${logPath}" 2>&1`;

	if (serverId) {
		await execAsyncRemote(serverId, wrappedCommand);
	} else {
		await execAsync(wrappedCommand);
	}
};
