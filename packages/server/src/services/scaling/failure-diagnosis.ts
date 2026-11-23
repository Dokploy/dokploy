import type Dockerode from "dockerode";
import {
	type ContainerDiagnosis,
	explainFailure,
	type ReplicaInfo,
} from "./task-status";

const CACHE_LIMIT = 500;
const OUTPUT_LIMIT = 160;

// An exited container never changes, so each one is inspected once. Null
// marks one Docker no longer has, or that ran on a node this connection does
// not reach.
const cache = new Map<string, ContainerDiagnosis | null>();

const remember = (id: string, diagnosis: ContainerDiagnosis | null) => {
	cache.set(id, diagnosis);
	if (cache.size > CACHE_LIMIT) {
		cache.delete(cache.keys().next().value as string);
	}
	return diagnosis;
};

const clip = (output: string) => {
	const line = output.replace(/\s+/g, " ").trim();
	return line.length > OUTPUT_LIMIT
		? `${line.slice(0, OUTPUT_LIMIT - 1)}…`
		: line;
};

interface InspectedState {
	OOMKilled?: boolean;
	Health?: { Log?: { ExitCode?: number; Output?: string }[] };
}

export const diagnosisOf = (state: InspectedState): ContainerDiagnosis => ({
	oomKilled: !!state.OOMKilled,
	failedChecks: (state.Health?.Log ?? [])
		.filter((check) => check.ExitCode !== 0)
		.map((check) => clip(check.Output ?? ""))
		.filter(Boolean),
});

const inspect = async (
	docker: Pick<Dockerode, "getContainer">,
	id: string,
): Promise<ContainerDiagnosis | null> => {
	if (cache.has(id)) return cache.get(id) ?? null;
	try {
		const info = await docker.getContainer(id).inspect();
		return remember(id, diagnosisOf(info.State as InspectedState));
	} catch (error) {
		if ((error as { statusCode?: number }).statusCode === 404) {
			return remember(id, null);
		}
		return null;
	}
};

/**
 * Adds what each failed replica's exited container shows, whether it ran out
 * of memory and what its health checks said, to the cause of its failure.
 * The Swarm task records neither.
 */
export const diagnoseFailures = (
	docker: Pick<Dockerode, "getContainer">,
	failures: ReplicaInfo[],
): Promise<ReplicaInfo[]> =>
	Promise.all(
		failures.map(async (failure) => {
			if (!failure.containerId) return failure;
			const container = await inspect(docker, failure.containerId);
			return container
				? {
						...failure,
						cause: explainFailure({
							error: failure.error,
							exitCode: failure.exitCode,
							container,
						}),
					}
				: failure;
		}),
	);
