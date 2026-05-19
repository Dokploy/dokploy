export type DeploymentStrategy = "standard" | "zero-downtime";

export type UpdateConfigSwarm = {
	Parallelism?: number;
	Delay?: number;
	FailureAction?: string;
	Monitor?: number;
	MaxFailureRatio?: number;
	Order?: string;
} | null;

export type ServiceModeSwarm = {
	Replicated?: { Replicas?: number };
	Global?: Record<string, never>;
	ReplicatedJob?: {
		MaxConcurrent?: number;
		TotalCompletions?: number;
	};
	GlobalJob?: Record<string, never>;
} | null;

export const getDeploymentStrategy = (
	updateConfigSwarm: UpdateConfigSwarm | undefined,
): DeploymentStrategy =>
	updateConfigSwarm?.Order === "stop-first" ? "standard" : "zero-downtime";

export const getEffectiveInstances = (
	replicas?: number,
	modeSwarm?: ServiceModeSwarm,
) => modeSwarm?.Replicated?.Replicas ?? replicas ?? 1;

export const isValidInstanceCount = (instances: number) =>
	Number.isInteger(instances) && instances >= 1;

export const buildUpdateConfigSwarm = (
	currentUpdateConfigSwarm: UpdateConfigSwarm | undefined,
	strategy: DeploymentStrategy,
) => {
	const baseConfig = currentUpdateConfigSwarm ?? {
		FailureAction: "rollback",
		Parallelism: 1,
	};

	return {
		...baseConfig,
		Parallelism: currentUpdateConfigSwarm?.Parallelism ?? 1,
		Order: strategy === "standard" ? "stop-first" : "start-first",
	};
};
