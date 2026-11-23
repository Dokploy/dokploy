/**
 * What the shared scaling cards act on: an application (one Swarm service),
 * or one service of a compose deployment, run either by Swarm (Stack) or by
 * Docker Compose on a single host.
 */
export type ScaleTarget =
	| { kind: "application"; applicationId: string }
	| {
			kind: "compose";
			composeId: string;
			serviceName: string;
			engine: "swarm" | "compose";
	  };

export const usesSwarm = (target: ScaleTarget) =>
	target.kind === "application" || target.engine === "swarm";
