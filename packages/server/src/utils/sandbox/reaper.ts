import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { sandboxes, server } from "@dokploy/server/db/schema";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import type Dockerode from "dockerode";
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { killSandbox } from "../../services/sandbox";
import { SANDBOX_ID_LABEL, SANDBOX_LABEL } from "./container";

export const SANDBOX_REAPER_INTERVAL_MS = 15_000;
const STUCK_CREATING_MS = 10 * 60 * 1000;

let reaperTimer: NodeJS.Timeout | null = null;
let reaping = false;

export const findExpiredSandboxes = <
	T extends { status: string; expiresAt: Date | null },
>(
	list: T[],
	now: Date,
) =>
	list.filter(
		(sandbox) =>
			sandbox.status === "running" &&
			!!sandbox.expiresAt &&
			sandbox.expiresAt.getTime() <= now.getTime(),
	);

export const reapExpiredSandboxes = async (
	now = new Date(),
	kill: (sandboxId: string) => Promise<unknown> = killSandbox,
) => {
	const expired = await db.query.sandboxes.findMany({
		where: and(eq(sandboxes.status, "running"), lte(sandboxes.expiresAt, now)),
		columns: { sandboxId: true, status: true, expiresAt: true },
	});
	const killed: string[] = [];
	for (const sandbox of findExpiredSandboxes(expired, now)) {
		try {
			await kill(sandbox.sandboxId);
			killed.push(sandbox.sandboxId);
		} catch (error) {
			console.error(
				`[Sandbox] Failed to reap ${sandbox.sandboxId}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}
	return killed;
};

export interface SandboxReconcilePlan {
	removeContainers: string[];
	markError: string[];
}

export const planSandboxReconcile = (
	rows: { sandboxId: string; containerId: string | null; status: string }[],
	containers: { Id: string; State: string; Labels: Record<string, string> }[],
): SandboxReconcilePlan => {
	const rowsById = new Map(rows.map((row) => [row.sandboxId, row]));
	const liveContainerIds = new Set<string>();
	const removeContainers: string[] = [];

	for (const container of containers) {
		const sandboxId = container.Labels?.[SANDBOX_ID_LABEL];
		const row = sandboxId ? rowsById.get(sandboxId) : undefined;
		// A sandbox mid-creation has no containerId yet; leave it to createSandbox.
		if (row?.status === "creating") continue;
		if (
			!row ||
			row.containerId !== container.Id ||
			container.State !== "running"
		) {
			removeContainers.push(container.Id);
			continue;
		}
		liveContainerIds.add(container.Id);
	}

	const markError = rows
		.filter(
			(row) =>
				row.status === "running" &&
				(!row.containerId || !liveContainerIds.has(row.containerId)),
		)
		.map((row) => row.sandboxId);

	return { removeContainers, markError };
};

const listSandboxContainers = (docker: Dockerode) =>
	docker.listContainers({
		all: true,
		filters: { label: [`${SANDBOX_LABEL}=true`] },
	});

const reconcileServer = async (serverId: string | null) => {
	const docker = await getRemoteDocker(serverId);
	const [containers, rows] = await Promise.all([
		listSandboxContainers(docker),
		db.query.sandboxes.findMany({
			where: and(
				inArray(sandboxes.status, ["running", "creating"]),
				serverId
					? eq(sandboxes.serverId, serverId)
					: isNull(sandboxes.serverId),
			),
			columns: { sandboxId: true, containerId: true, status: true },
		}),
	]);
	const plan = planSandboxReconcile(rows, containers);

	for (const containerId of plan.removeContainers) {
		await docker
			.getContainer(containerId)
			.remove({ force: true })
			.catch(() => {});
	}
	if (plan.markError.length > 0) {
		await db
			.update(sandboxes)
			.set({ status: "error" })
			.where(inArray(sandboxes.sandboxId, plan.markError));
	}
	return plan;
};

export const reconcileSandboxes = async () => {
	const stuckSince = new Date(Date.now() - STUCK_CREATING_MS);
	await db
		.update(sandboxes)
		.set({ status: "error" })
		.where(
			and(
				eq(sandboxes.status, "creating"),
				lte(sandboxes.createdAt, stuckSince.toISOString()),
			),
		);

	const serverIds: (string | null)[] = IS_CLOUD ? [] : [null];
	const remoteServers = await db.query.server.findMany({
		where: isNotNull(server.sshKeyId),
		columns: { serverId: true },
	});
	serverIds.push(...remoteServers.map((remote) => remote.serverId));

	for (const serverId of serverIds) {
		try {
			const plan = await reconcileServer(serverId);
			if (plan.removeContainers.length || plan.markError.length) {
				console.log(
					`[Sandbox] Reconciled ${serverId ?? "local"}: removed ${plan.removeContainers.length} containers, errored ${plan.markError.length} sandboxes`,
				);
			}
		} catch (error) {
			console.error(
				`[Sandbox] Reconcile failed for ${serverId ?? "local"}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}
};

export const initSandboxReaper = async () => {
	if (reaperTimer) return;
	await reconcileSandboxes();
	reaperTimer = setInterval(async () => {
		if (reaping) return;
		reaping = true;
		try {
			await reapExpiredSandboxes();
		} catch (error) {
			console.error(
				"[Sandbox] Reaper failed:",
				error instanceof Error ? error.message : error,
			);
		} finally {
			reaping = false;
		}
	}, SANDBOX_REAPER_INTERVAL_MS);
	reaperTimer.unref();
};

export const stopSandboxReaper = () => {
	if (reaperTimer) clearInterval(reaperTimer);
	reaperTimer = null;
};
