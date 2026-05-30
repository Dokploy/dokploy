import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type cloudflare,
	cloudflareTunnelRuntime,
} from "@dokploy/server/db/schema";
import { encodeBase64 } from "@dokploy/server/utils/docker/utils";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import {
	createTunnel,
	deleteTunnel,
	getTunnelToken,
	listTunnels,
} from "@dokploy/server/utils/providers/cloudflare";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import type { ContainerCreateOptions } from "dockerode";
import { and, eq, isNull } from "drizzle-orm";

type CloudflareIntegration = typeof cloudflare.$inferSelect;
export type CloudflareTunnelRuntime =
	typeof cloudflareTunnelRuntime.$inferSelect;

/**
 * cloudflared connector image. The connector pulls its ingress configuration
 * from the Cloudflare edge (remotely-managed tunnels), so no local config is
 * needed — only the connector token.
 */
export const CLOUDFLARED_IMAGE = "cloudflare/cloudflared:latest";

/** Inside the connector container the token is mounted read-only here. */
const TOKEN_CONTAINER_PATH = "/etc/cloudflared/token";

/** Deterministic container name keeps a single connector per tunnel. */
export const getConnectorContainerName = (tunnelId: string): string =>
	`dokploy-cloudflared-${tunnelId}`;

/** Host path of the connector token for a tunnel on the target server. */
const getTokenHostPath = (
	serverId: string | null,
	tunnelId: string,
): string => {
	// Tunnel ids are Cloudflare-assigned UUIDs. Reject anything else before the
	// id is interpolated into a remote shell command / `rm -rf` path, so an
	// empty or malformed id can never widen the teardown to a parent directory.
	if (!/^[A-Za-z0-9-]+$/.test(tunnelId)) {
		throw new Error(
			`Invalid Cloudflare tunnel id: ${JSON.stringify(tunnelId)}`,
		);
	}
	const { BASE_PATH } = paths(!!serverId);
	return `${BASE_PATH}/cloudflare/${tunnelId}/token`;
};

// ---------------------------------------------------------------------------
// Per-tunnel in-process lock
// ---------------------------------------------------------------------------

const tunnelLocks = new Map<string, Promise<unknown>>();

/**
 * Serializes mutations (connector deploy, ingress/DNS updates) per tunnel so
 * simultaneous publishes don't race. Single-process, in-memory — sufficient for
 * the self-hosted dashboard.
 */
export const withTunnelLock = async <T>(
	tunnelId: string,
	fn: () => Promise<T>,
): Promise<T> => {
	const previous = tunnelLocks.get(tunnelId) ?? Promise.resolve();
	let release: () => void = () => {};
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	// Store `current` itself (not a chained promise) so the cleanup equality
	// check below can match and the map doesn't leak entries.
	tunnelLocks.set(tunnelId, current);
	await previous.catch(() => {});
	try {
		return await fn();
	} finally {
		release();
		// Drop the entry once this was the last waiter to avoid unbounded growth.
		if (tunnelLocks.get(tunnelId) === current) {
			tunnelLocks.delete(tunnelId);
		}
	}
};

// ---------------------------------------------------------------------------
// Connector token (never persisted in the DB; fetched on demand)
// ---------------------------------------------------------------------------

const writeTunnelToken = async (
	serverId: string | null,
	tunnelId: string,
	token: string,
): Promise<string> => {
	const tokenPath = getTokenHostPath(serverId, tunnelId);
	if (serverId) {
		// Decode from base64 on the remote so the raw token never lands in shell
		// history beyond the transient command, and so quoting is safe.
		const encoded = encodeBase64(token);
		await execAsyncRemote(
			serverId,
			`mkdir -p "${dirname(tokenPath)}" && echo "${encoded}" | base64 -d > "${tokenPath}" && chmod 600 "${tokenPath}"`,
		);
	} else {
		await mkdir(dirname(tokenPath), { recursive: true });
		await writeFile(tokenPath, token, { mode: 0o600 });
	}
	return tokenPath;
};

const removeTunnelTokenFile = async (
	serverId: string | null,
	tunnelId: string,
): Promise<void> => {
	const tokenPath = getTokenHostPath(serverId, tunnelId);
	try {
		if (serverId) {
			await execAsyncRemote(serverId, `rm -rf "${dirname(tokenPath)}"`);
		} else {
			await rm(dirname(tokenPath), { recursive: true, force: true });
		}
	} catch {
		// best-effort cleanup
	}
};

// ---------------------------------------------------------------------------
// Connector container lifecycle
// ---------------------------------------------------------------------------

const pullImage = async (
	docker: Awaited<ReturnType<typeof getRemoteDocker>>,
	image: string,
): Promise<void> => {
	// Attempt a refresh so the `:latest` connector picks up upstream fixes (it
	// runs with --no-autoupdate). A pull of an already-current tag only checks
	// the manifest, not full layers. If the registry is unreachable, fall back
	// to the locally cached image rather than failing the deploy; only rethrow
	// when the image isn't present locally at all.
	try {
		const stream = await docker.pull(image);
		await new Promise((resolve, reject) => {
			docker.modem.followProgress(stream, (err: Error | null) =>
				err ? reject(err) : resolve(null),
			);
		});
	} catch (error) {
		await docker
			.getImage(image)
			.inspect()
			.catch(() => {
				throw error;
			});
	}
};

/**
 * (Re)deploys the cloudflared connector container for a tunnel. The token is
 * mounted as a read-only file and read at runtime, so it never appears in
 * `docker inspect` (Cmd/Env) and is never logged.
 */
export const deployConnector = async ({
	serverId,
	tunnelId,
	token,
}: {
	serverId: string | null;
	tunnelId: string;
	token: string;
}): Promise<void> => {
	const containerName = getConnectorContainerName(tunnelId);
	const tokenPath = await writeTunnelToken(serverId, tunnelId, token);
	const docker = await getRemoteDocker(serverId);

	await pullImage(docker, CLOUDFLARED_IMAGE);

	try {
		await docker.getContainer(containerName).remove({ force: true });
	} catch {
		// no existing container
	}

	const settings: ContainerCreateOptions = {
		name: containerName,
		Image: CLOUDFLARED_IMAGE,
		// cloudflared reads the token straight from the mounted file via its
		// native --token-file flag: the secret stays out of `docker inspect`
		// (Cmd/Env), and no shell is required — the official connector image is
		// distroless (no `sh`). cloudflared is PID 1, so it receives stop signals.
		Entrypoint: ["cloudflared"],
		Cmd: [
			"tunnel",
			"--no-autoupdate",
			"--loglevel",
			"info",
			"run",
			"--token-file",
			TOKEN_CONTAINER_PATH,
		],
		// Run as root so cloudflared can read the chmod-600 (root-owned) token
		// file. The connector image defaults to a non-root user, which otherwise
		// gets "permission denied" reading the bind-mounted secret.
		User: "0:0",
		HostConfig: {
			RestartPolicy: { Name: "always" },
			Binds: [`${tokenPath}:${TOKEN_CONTAINER_PATH}:ro`],
		},
		NetworkingConfig: {
			EndpointsConfig: {
				"dokploy-network": {},
			},
		},
	};

	await docker.createContainer(settings);
	await docker.getContainer(containerName).start();
};

export const isConnectorRunning = async (
	serverId: string | null,
	tunnelId: string,
): Promise<boolean> => {
	try {
		const docker = await getRemoteDocker(serverId);
		const info = await docker
			.getContainer(getConnectorContainerName(tunnelId))
			.inspect();
		return info.State?.Running ?? false;
	} catch {
		return false;
	}
};

export const removeConnector = async (
	serverId: string | null,
	tunnelId: string,
): Promise<void> => {
	try {
		const docker = await getRemoteDocker(serverId);
		await docker
			.getContainer(getConnectorContainerName(tunnelId))
			.remove({ force: true });
	} catch {
		// container already gone
	}
	await removeTunnelTokenFile(serverId, tunnelId);
};

// ---------------------------------------------------------------------------
// Runtime row + shared-managed tunnel resolution
// ---------------------------------------------------------------------------

const findRuntime = async (
	organizationId: string,
	cloudflareId: string,
	serverId: string | null,
): Promise<CloudflareTunnelRuntime | undefined> =>
	db.query.cloudflareTunnelRuntime.findFirst({
		where: and(
			eq(cloudflareTunnelRuntime.organizationId, organizationId),
			eq(cloudflareTunnelRuntime.cloudflareId, cloudflareId),
			serverId
				? eq(cloudflareTunnelRuntime.serverId, serverId)
				: isNull(cloudflareTunnelRuntime.serverId),
		),
	});

/**
 * Deterministic tunnel name for a Dokploy-managed (shared) tunnel. Includes the
 * server identity: a tunnel load-balances across all its connectors, so each
 * server must get its OWN tunnel or requests could be routed to the wrong
 * server's Traefik.
 */
const sharedTunnelName = (
	cloudflareId: string,
	serverId: string | null,
): string => `dokploy-${cloudflareId}-${serverId ?? "local"}`;

/**
 * Resolves (find-or-create) the Dokploy-managed tunnel + connector for a
 * (organization, server, integration) tuple and returns its runtime row.
 * Idempotent and serialized so concurrent publishes converge on one connector.
 */
export const ensureSharedManagedTunnel = async ({
	integration,
	organizationId,
	serverId,
}: {
	integration: CloudflareIntegration;
	organizationId: string;
	serverId: string | null;
}): Promise<CloudflareTunnelRuntime> => {
	const { apiToken, accountId, cloudflareId } = integration;

	const existing = await findRuntime(organizationId, cloudflareId, serverId);
	if (existing) {
		// Repair drift: ensure the connector is actually running.
		if (!(await isConnectorRunning(serverId, existing.tunnelId))) {
			await reconcileConnector(existing);
		}
		return existing;
	}

	const tunnelName = sharedTunnelName(cloudflareId, serverId);
	return withTunnelLock(
		`shared:${cloudflareId}:${serverId ?? "local"}`,
		async () => {
			// Re-check under lock.
			const raced = await findRuntime(organizationId, cloudflareId, serverId);
			if (raced) return raced;

			// Reuse an existing remotely-managed tunnel with our name, else create one.
			const tunnels = await listTunnels(apiToken, accountId);
			const reusable = tunnels.find(
				(t) => t.name === tunnelName && t.config_src === "cloudflare",
			);
			const tunnel =
				reusable ?? (await createTunnel(apiToken, accountId, tunnelName));

			const token = await getTunnelToken(apiToken, accountId, tunnel.id);
			await deployConnector({ serverId, tunnelId: tunnel.id, token });

			const inserted = await db
				.insert(cloudflareTunnelRuntime)
				.values({
					organizationId,
					cloudflareId,
					serverId: serverId ?? null,
					tunnelId: tunnel.id,
					tunnelName,
					dockerResourceName: getConnectorContainerName(tunnel.id),
					runtimeMode: "shared-managed",
					status: "running",
					lastStartedAt: new Date(),
				})
				.returning()
				.then((rows) => rows[0]);

			if (!inserted) {
				throw new Error("Failed to persist Cloudflare tunnel runtime");
			}
			return inserted;
		},
	);
};

/** Re-deploys the connector for a runtime row and refreshes its status. */
export const reconcileConnector = async (
	runtime: CloudflareTunnelRuntime,
): Promise<void> => {
	const { findCloudflareById } = await import(
		"@dokploy/server/services/cloudflare"
	);
	try {
		const integration = await findCloudflareById(runtime.cloudflareId);
		const token = await getTunnelToken(
			integration.apiToken,
			integration.accountId,
			runtime.tunnelId,
		);
		await deployConnector({
			serverId: runtime.serverId,
			tunnelId: runtime.tunnelId,
			token,
		});
		await db
			.update(cloudflareTunnelRuntime)
			.set({ status: "running", lastStartedAt: new Date(), lastError: null })
			.where(eq(cloudflareTunnelRuntime.id, runtime.id));
	} catch (error) {
		await db
			.update(cloudflareTunnelRuntime)
			.set({
				status: "error",
				lastError: error instanceof Error ? error.message : "Unknown error",
			})
			.where(eq(cloudflareTunnelRuntime.id, runtime.id));
		throw error;
	}
};

/**
 * Tears down the Dokploy-managed connector + tunnel for a runtime row: removes
 * the container, deletes the tunnel from Cloudflare, and drops the runtime row.
 * Used when the last published domain on a shared tunnel is removed.
 */
export const teardownSharedManagedTunnel = async (
	runtime: CloudflareTunnelRuntime,
	integration: CloudflareIntegration,
): Promise<void> => {
	await removeConnector(runtime.serverId, runtime.tunnelId);
	try {
		await deleteTunnel(
			integration.apiToken,
			integration.accountId,
			runtime.tunnelId,
		);
	} catch {
		// best-effort: the tunnel may already be gone
	}
	await db
		.delete(cloudflareTunnelRuntime)
		.where(eq(cloudflareTunnelRuntime.id, runtime.id));
};

export const findRuntimeByTunnelId = async (
	organizationId: string,
	tunnelId: string,
): Promise<CloudflareTunnelRuntime | undefined> =>
	db.query.cloudflareTunnelRuntime.findFirst({
		where: and(
			eq(cloudflareTunnelRuntime.organizationId, organizationId),
			eq(cloudflareTunnelRuntime.tunnelId, tunnelId),
		),
	});
