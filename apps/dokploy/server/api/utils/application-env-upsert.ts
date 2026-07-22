import type { DeploymentJob } from "@/server/queues/queue-types";

type ApplicationEnvUpsertDeploymentTarget = {
	applicationId: string;
	serverId?: string | null;
};

export const buildApplicationEnvUpsertDeploymentJob = ({
	applicationId,
	serverId,
}: ApplicationEnvUpsertDeploymentTarget): DeploymentJob => ({
	applicationId,
	titleLog: "Rebuild deployment",
	descriptionLog: "Environment variables updated",
	type: "redeploy",
	applicationType: "application",
	server: !!serverId,
	serverId: serverId ?? undefined,
});
