import type { Application } from "@dokploy/server/services/application";

type BuildServerFields = Pick<
	Application,
	"sourceType" | "buildServerId" | "serverId"
>;

/**
 * A pre-built image ("docker" source) has nothing to build, and the Swarm
 * service is always updated on `serverId`, so a build server left over from an
 * earlier git-based setup must not be used to pull the image.
 */
export const getBuildServerId = (application: BuildServerFields) =>
	application.sourceType === "docker" ? null : application.buildServerId;

export const getBuildExecutionServerId = (application: BuildServerFields) =>
	getBuildServerId(application) || application.serverId;
