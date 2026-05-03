import type { ContainerCreateOptions } from "dockerode";
import { docker } from "../constants";

export const LOCAL_TUNNEL_CONTAINER_NAME = "dokploy-tunnel";
const CLOUDFLARED_IMAGE = "cloudflare/cloudflared:latest";
const DOKPLOY_NETWORK = "dokploy-network";

const redactToken = (token: string, s: string) =>
	token ? s.split(token).join("[REDACTED]") : s;

const pullImage = async (
	imageName: string,
	onData?: (data: string) => void,
): Promise<void> => {
	const stream = await docker.pull(imageName);
	await new Promise<void>((resolve, reject) => {
		docker.modem.followProgress(
			stream as NodeJS.ReadableStream,
			(err) => (err ? reject(err) : resolve()),
			(event: { status?: string; progress?: string }) => {
				if (event.status) {
					const line = event.progress
						? `${event.status} ${event.progress}\n`
						: `${event.status}\n`;
					onData?.(line);
				}
			},
		);
	});
};

export const installLocalCloudflared = async (
	tunnelToken: string,
	onData?: (data: string) => void,
): Promise<void> => {
	const onLine = (s: string) => onData?.(redactToken(tunnelToken, s));

	onLine("Pulling cloudflared image...\n");
	try {
		await pullImage(CLOUDFLARED_IMAGE, onLine);
	} catch (err) {
		onLine(
			`Image pull failed (will try existing local image): ${
				err instanceof Error ? err.message : String(err)
			}\n`,
		);
	}

	// Recreate the container if it already exists. Token rotation requires this.
	try {
		const existing = docker.getContainer(LOCAL_TUNNEL_CONTAINER_NAME);
		await existing.remove({ force: true });
		onLine("Removed existing dokploy-tunnel container\n");
	} catch {
		// not present
	}

	const settings: ContainerCreateOptions = {
		name: LOCAL_TUNNEL_CONTAINER_NAME,
		Image: CLOUDFLARED_IMAGE,
		Cmd: ["tunnel", "--no-autoupdate", "run", "--token", tunnelToken],
		HostConfig: {
			RestartPolicy: { Name: "unless-stopped" },
			NetworkMode: DOKPLOY_NETWORK,
		},
		NetworkingConfig: {
			EndpointsConfig: { [DOKPLOY_NETWORK]: {} },
		},
		Labels: {
			"com.dokploy.managed": "true",
			"com.dokploy.role": "cloudflare-local-tunnel",
		},
	};

	onLine("Creating dokploy-tunnel container...\n");
	const container = await docker.createContainer(settings);
	await container.start();
	onLine("dokploy-tunnel started ✅\n");
};

export const uninstallLocalCloudflared = async (
	onData?: (data: string) => void,
): Promise<void> => {
	try {
		const container = docker.getContainer(LOCAL_TUNNEL_CONTAINER_NAME);
		await container.remove({ force: true });
		onData?.("dokploy-tunnel removed ✅\n");
	} catch (err) {
		onData?.(
			`failed to remove dokploy-tunnel: ${
				err instanceof Error ? err.message : String(err)
			}\n`,
		);
	}
};

export const inspectLocalCloudflared = async (): Promise<{
	running: boolean;
	state?: string;
}> => {
	try {
		const container = docker.getContainer(LOCAL_TUNNEL_CONTAINER_NAME);
		const info = await container.inspect();
		return { running: info.State.Running, state: info.State.Status };
	} catch {
		return { running: false };
	}
};
