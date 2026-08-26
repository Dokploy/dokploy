import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import { isMissingResourceError } from "./cleanup";

/**
 * The three runtime shapes a moveable service can be deployed as:
 * - `service`: a Docker Swarm service (every database type - postgres,
 *   mysql, mariadb, mongo, redis, libsql - is deployed this way).
 * - `stack`: a Compose service deployed via `docker stack deploy`.
 * - `docker-compose`: a Compose service deployed via `docker compose up`.
 */
export type RuntimeKind = "service" | "stack" | "docker-compose";

/**
 * The Docker label Swarm/stack/Compose itself stamps onto every container
 * belonging to a service/stack/project - reading this back via `docker ps`
 * with `--filter status=running` gives an authoritative, Docker-verified
 * count of currently-running containers, instead of text-matching a task's
 * `DesiredState`/`CurrentState` column (which can lag behind reality).
 */
const LABEL_KEY_BY_KIND: Record<RuntimeKind, string> = {
	service: "com.docker.swarm.service.name",
	stack: "com.docker.stack.namespace",
	"docker-compose": "com.docker.compose.project",
};

const runInspectCommand = async (
	serverId: string | null,
	command: string,
): Promise<string> => {
	const { stdout } = serverId
		? await execAsyncRemote(serverId, command)
		: await execAsync(command);
	return stdout;
};

/** Builds the command that lists the IDs of every currently-*running* container belonging to a service/stack/project. */
export const buildCountRunningContainersCommand = (
	kind: RuntimeKind,
	appName: string,
): string => {
	const labelKey = LABEL_KEY_BY_KIND[kind];
	return `docker ps --filter ${quote([`label=${labelKey}=${appName}`])} --filter status=running --format '{{.ID}}'`;
};

/**
 * Strictly counts the currently-running containers for a Swarm
 * service/stack/Compose project.
 *
 * Unlike `getServiceContainersByAppName`/`getContainersByAppNameMatch`
 * (which swallow SSH/Docker errors - including a non-empty `stderr` on an
 * otherwise-zero exit - and return `[]`), any failure to run this
 * inspection - a dead SSH connection, an unreachable Docker daemon, a
 * permissions error, a malformed command, ... - is thrown here, never
 * silently treated as "zero containers running". Callers (the
 * stop/start-verification polls in `database-move.ts`/`compose-move.ts`)
 * must let that propagate: a failed inspection means the true state is
 * unknown, and continuing as if it meant "stopped" (and copying volume
 * data that might still be changing) or "not yet running" (and endlessly
 * retrying) could corrupt data or hide a real outage.
 */
export const countRunningContainers = async (
	kind: RuntimeKind,
	appName: string,
	serverId: string | null,
): Promise<number> => {
	const stdout = await runInspectCommand(
		serverId,
		buildCountRunningContainersCommand(kind, appName),
	);
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean).length;
};

/**
 * Checks whether a Swarm service / stack / Compose project with the given
 * name already exists on a server - running or not - so a move can refuse
 * to land on top of a same-name collision before touching anything.
 *
 * - `service`: `docker service inspect` (exit 0 => exists).
 * - `stack`: `docker stack services` (fails with "nothing found in stack"
 *   if absent, which `isMissingResourceError` recognizes).
 * - `docker-compose`: Compose projects aren't first-class Docker objects,
 *   so existence is any container - running or not - carrying the
 *   project's label.
 *
 * Any error that isn't recognized as "definitely doesn't exist" propagates,
 * the same as `countRunningContainers` above - a failed check must never be
 * treated as "safe, nothing there".
 */
export const runtimeExistsOnTarget = async (
	kind: RuntimeKind,
	appName: string,
	serverId: string | null,
): Promise<boolean> => {
	if (kind === "docker-compose") {
		const command = `docker ps -a --filter ${quote([`label=${LABEL_KEY_BY_KIND[kind]}=${appName}`])} --format '{{.ID}}'`;
		const stdout = await runInspectCommand(serverId, command);
		return stdout.trim().length > 0;
	}

	const command =
		kind === "service"
			? `docker service inspect ${quote([appName])}`
			: `docker stack services ${quote([appName])} -q`;
	try {
		const stdout = await runInspectCommand(serverId, command);
		return kind === "stack" ? stdout.trim().length > 0 : true;
	} catch (error) {
		if (isMissingResourceError(error)) return false;
		throw error;
	}
};

/**
 * Atomically reserves a Swarm service name with a zero-replica placeholder.
 * Database/application deployers update an existing service, so this closes
 * the check-then-create race while keeping rollback ownership unambiguous.
 */
export const reserveServiceName = async (
	appName: string,
	serverId: string | null,
): Promise<void> => {
	const command = `docker service create --replicas 0 --name ${quote([appName])} --label ${quote(["dokploy.migration.reservation=true"])} busybox:latest true`;
	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};
