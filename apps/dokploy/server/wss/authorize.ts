import {
	findServerById,
	getAccessibleServerIds,
	IS_CLOUD,
} from "@dokploy/server";
import {
	checkServiceAccess,
	findMemberByUserId,
	hasPermission,
} from "@dokploy/server/services/permission";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import { findWssService } from "./service-resource";
import { isValidContainerId } from "./utils";

type WssUser = { id: string } | null | undefined;
type WssSession = { activeOrganizationId?: string | null } | null | undefined;

const buildCtx = (user: { id: string }, activeOrganizationId: string) => ({
	user: { id: user.id },
	session: { activeOrganizationId },
});

type DockerTarget =
	| { containerId: string; runType?: string | null }
	| { appName: string; appType: string };

export const authorizeDockerOverWss = async (
	user: WssUser,
	session: WssSession,
	serverId?: string | null,
	serviceId?: string | null,
	target?: DockerTarget,
): Promise<{ containerId?: string } | null> => {
	if (!user || !session?.activeOrganizationId || !target) return null;
	try {
		const ctx = buildCtx(user, session.activeOrganizationId);
		if (!(await hasPermission(ctx, { docker: ["read"] }))) return null;
		// The handlers interpret an absent server ID as the control-plane host.
		if (serverId === "local" || (!serverId && IS_CLOUD)) return null;
		if (serverId) {
			const accessible = await getAccessibleServerIds({
				userId: user.id,
				activeOrganizationId: session.activeOrganizationId,
			});
			if (!accessible.has(serverId)) return null;
			const server = await findServerById(serverId);
			if (server.organizationId !== session.activeOrganizationId) return null;
		}
		const member = await findMemberByUserId(
			user.id,
			session.activeOrganizationId,
		);
		const privileged = member.role === "owner" || member.role === "admin";
		// A Docker grant alone must not expose the local control plane to members.
		if (!serviceId && !serverId && !privileged) return null;
		let service: Awaited<ReturnType<typeof findWssService>> = null;
		if (serviceId) {
			await checkServiceAccess(ctx, serviceId, "read");
			service = await findWssService(serviceId, session.activeOrganizationId);
			if (!service || (service.serverId || null) !== (serverId || null))
				return null;
		}
		if ("appName" in target) {
			if (!["application", "stack", "docker-compose"].includes(target.appType))
				return null;
			if (target.appName === "dokploy")
				return privileged && !serviceId ? {} : null;
			if (!service) return privileged ? {} : null;
			if (target.appType !== service.appType) return null;
			if (target.appType === "application")
				return target.appName === service.appName ? {} : null;
		}
		const isContainer = "containerId" in target;
		const name = isContainer ? target.containerId : target.appName;
		if (!isValidContainerId(name)) return null;
		const swarm = isContainer && target.runType === "swarm";
		const command = quote([
			"docker",
			...(swarm ? [] : ["container"]),
			"inspect",
			name,
		]);
		const inspect = async (command: string) =>
			serverId ? execAsyncRemote(serverId, command) : execAsync(command);
		const { stdout } = await inspect(command);
		const [resource] = JSON.parse(stdout);
		let swarmService = resource;
		// docker service logs accepts task IDs as well as service IDs. Resolve
		// task ownership through its ServiceID, while retaining the task log target.
		if (swarm && resource.ServiceID) {
			if (
				typeof resource.ServiceID !== "string" ||
				!isValidContainerId(resource.ServiceID)
			)
				return null;
			const result = await inspect(
				quote(["docker", "service", "inspect", resource.ServiceID]),
			);
			[swarmService] = JSON.parse(result.stdout);
		}
		const labels =
			(swarm ? swarmService.Spec?.Labels : resource.Config?.Labels) ?? {};
		if (service) {
			const matches =
				service.appType === "stack"
					? labels["com.docker.stack.namespace"] === service.appName
					: service.appType === "docker-compose"
						? !swarm && labels["com.docker.compose.project"] === service.appName
						: (swarm
								? swarmService.Spec?.Name
								: labels["com.docker.swarm.service.name"]) === service.appName;
			if (!matches) return null;
		}
		const containerId = swarm ? resource.ID : resource.Id;
		if (typeof containerId !== "string" || !isValidContainerId(containerId))
			return null;
		// Execute against the inspected ID so a renamed/replaced container cannot
		// change the target between authorization and docker exec/logs.
		return { containerId };
	} catch {
		return null;
	}
};

export const canAccessDockerOverWss = async (
	...args: Parameters<typeof authorizeDockerOverWss>
) => (await authorizeDockerOverWss(...args)) !== null;

// Authorizes the host/server SSH terminal opened over a WebSocket. The local
// host terminal is a root shell on the control-plane host, so it is restricted
// to owner/admin. A remote server terminal needs server access plus
// server.terminal.
export const canAccessTerminalOverWss = async (
	user: WssUser,
	session: WssSession,
	serverId?: string | null,
): Promise<boolean> => {
	if (!user || !session?.activeOrganizationId) return false;

	if (serverId && serverId !== "local") {
		const accessible = await getAccessibleServerIds({
			userId: user.id,
			activeOrganizationId: session.activeOrganizationId,
		});
		if (!accessible.has(serverId)) return false;

		return await hasPermission(buildCtx(user, session.activeOrganizationId), {
			server: ["terminal"],
		});
	}

	try {
		const member = await findMemberByUserId(
			user.id,
			session.activeOrganizationId,
		);
		return member?.role === "owner" || member?.role === "admin";
	} catch {
		return false;
	}
};
