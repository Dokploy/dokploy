import { AsyncLocalStorage } from "node:async_hooks";
import type { ChildProcess } from "node:child_process";
import type { Client } from "ssh2";

/**
 * Per-deployment job context that flows through every async call
 * (deployApplication → getBuildCommand → execAsync / execAsyncRemote)
 * via Node's AsyncLocalStorage.
 *
 * NOTE on the `Symbol.for(...)` singleton dance below: the dokploy app
 * bundles `@dokploy/server` as an *external* dependency, so this file
 * gets loaded twice in production — once for the app's own code, once
 * for the workspace package. Without pinning the instances on
 * `globalThis`, the AsyncLocalStorage / child registries would be two
 * separate copies, and context set in the worker handler would be
 * invisible to `execAsync`. Cancel would then have nothing to kill.
 */
export interface JobContext {
	jobId: string;
	/** null = LOCAL (Dokploy host); otherwise the remote serverId. */
	serverId: string | null;
}

const STORE_KEY = Symbol.for("dokploy.jobContext.store");
const LOCAL_KEY = Symbol.for("dokploy.jobContext.localChildren");
const REMOTE_KEY = Symbol.for("dokploy.jobContext.remoteSshClients");

type GlobalShared = typeof globalThis & {
	[STORE_KEY]?: AsyncLocalStorage<JobContext>;
	[LOCAL_KEY]?: Map<string, Set<ChildProcess>>;
	[REMOTE_KEY]?: Map<string, Set<Client>>;
};

const g = globalThis as GlobalShared;

export const dokployJobContext: AsyncLocalStorage<JobContext> =
	g[STORE_KEY] ?? (g[STORE_KEY] = new AsyncLocalStorage<JobContext>());

const localChildren: Map<string, Set<ChildProcess>> = g[LOCAL_KEY] ??
(g[LOCAL_KEY] = new Map());

const remoteSshClients: Map<string, Set<Client>> = g[REMOTE_KEY] ??
(g[REMOTE_KEY] = new Map());

export const getCurrentJob = (): JobContext | undefined =>
	dokployJobContext.getStore();

/** Marker injected into the deploy command line for `pkill -f` matching. */
export const jobMarker = (jobId: string): string => `DOKPLOY_JOB_ID=${jobId}`;

export const trackLocalChild = (jobId: string, child: ChildProcess): void => {
	let set = localChildren.get(jobId);
	if (!set) {
		set = new Set();
		localChildren.set(jobId, set);
	}
	set.add(child);
	const cleanup = () => {
		const s = localChildren.get(jobId);
		s?.delete(child);
		if (s && s.size === 0) localChildren.delete(jobId);
	};
	child.once("exit", cleanup);
	child.once("close", cleanup);
};

export const trackSshClient = (jobId: string, client: Client): void => {
	let set = remoteSshClients.get(jobId);
	if (!set) {
		set = new Set();
		remoteSshClients.set(jobId, set);
	}
	set.add(client);
	const cleanup = () => {
		const s = remoteSshClients.get(jobId);
		s?.delete(client);
		if (s && s.size === 0) remoteSshClients.delete(jobId);
	};
	client.once("end", cleanup);
	client.once("close", cleanup);
};

/**
 * Grace period between the initial SIGINT and the SIGKILL cleanup sweep.
 * SIGINT lets `docker buildx` forward a cancel to BuildKit and tear down
 * the dockerd-owned RUN-step container; the SIGKILL afterwards reaps
 * anything (shell, nixpacks, a wedged CLI) that ignored the interrupt.
 */
const BUILD_CANCEL_GRACE_MS = 4000;

/**
 * Kill every process this job spawned.
 *
 * LOCAL: signal the whole process group (PGID = child.pid; the shell was
 * spawned with `detached: true`, so it leads its own group). We send
 * SIGINT first, wait a grace period, then SIGKILL — this tears down sh,
 * `docker compose`, `docker build`/buildx and, crucially, lets buildx
 * relay the cancel to BuildKit so the in-flight RUN-step container dies
 * too. A bare SIGKILL would skip buildx's signal handler and orphan that
 * RUN step, letting it run to natural completion. Falls back to the bare
 * pid when the group is already gone (ESRCH).
 *
 * REMOTE: destroy the ssh client (force-close the socket); the
 * stream error triggers promise rejection in execAsyncRemote,
 * propagating cancellation through the handler.
 */
export const killJobProcesses = (
	jobId: string,
): { local: number; remote: number } => {
	let local = 0;
	let remote = 0;
	const localSet = localChildren.get(jobId);
	const sshSet = remoteSshClients.get(jobId);
	if (localSet) {
		for (const child of localSet) {
			if (!child.pid) continue;
			const pid = child.pid;
			// Signal the whole process group (PGID = pid, since the shell was
			// spawned detached). Fall back to the bare pid if the group is
			// already gone (ESRCH) — that still closes the shell's stdio,
			// which the docker CLIs treat as a cancel.
			const signalGroup = (sig: NodeJS.Signals) => {
				try {
					process.kill(-pid, sig);
				} catch {
					try {
						child.kill(sig);
					} catch {
						// Already gone — nothing more to do.
					}
				}
			};
			// SIGINT first so buildx can relay the cancel to BuildKit and tear
			// down the RUN-step container, then SIGKILL after a grace period to
			// reap anything that ignored the interrupt.
			signalGroup("SIGINT");
			setTimeout(() => signalGroup("SIGKILL"), BUILD_CANCEL_GRACE_MS).unref();
			local++;
		}
		localChildren.delete(jobId);
	}
	if (sshSet) {
		for (const client of sshSet) {
			try {
				client.destroy();
				remote++;
			} catch {}
		}
		remoteSshClients.delete(jobId);
	}
	return { local, remote };
};
