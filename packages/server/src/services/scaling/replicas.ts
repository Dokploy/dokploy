import { db } from "@dokploy/server/db";
import { applications, type ServiceModeSwarm } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

export type ServiceMode =
	| "replicated"
	| "global"
	| "replicated-job"
	| "global-job";

export interface ReplicaSettings {
	replicas: number;
	modeSwarm: ServiceModeSwarm | null;
}

export const getServiceMode = (
	modeSwarm: ServiceModeSwarm | null | undefined,
): ServiceMode => {
	if (!modeSwarm || modeSwarm.Replicated) return "replicated";
	if (modeSwarm.Global) return "global";
	if (modeSwarm.ReplicatedJob) return "replicated-job";
	if (modeSwarm.GlobalJob) return "global-job";
	return "replicated";
};

export const getConfiguredReplicas = ({
	replicas,
	modeSwarm,
}: ReplicaSettings) => {
	if (!modeSwarm) return replicas;
	// A replicated mode without an explicit count runs one task.
	return modeSwarm.Replicated?.Replicas ?? 1;
};

// Deploy jobs load the application when they start; the count can change
// while the build runs, so read it again right before applying the spec.
export const findReplicaSettings = async (
	applicationId: string | undefined,
): Promise<ReplicaSettings | undefined> => {
	if (!applicationId) return undefined;
	const row = await db.query.applications.findFirst({
		where: eq(applications.applicationId, applicationId),
		columns: { replicas: true, modeSwarm: true },
	});
	return row ?? undefined;
};
