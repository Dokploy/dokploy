import type { EndpointSpecSwarm } from "../../db/schema/shared";
import type { ComposeSpecification, DefinitionsService } from "./types";

export type SwarmEndpointMode = "vip" | "dnsrr";

/**
 * Swarm VIPs need IPVS, which some hosts cannot set up: an unprivileged LXC
 * container is refused by the kernel. With DOKPLOY_SWARM_ENDPOINT_MODE=dnsrr,
 * the services Dokploy deploys resolve to their replicas' own addresses.
 */
export const getSwarmEndpointMode = (): SwarmEndpointMode =>
	process.env.DOKPLOY_SWARM_ENDPOINT_MODE?.trim().toLowerCase() === "dnsrr"
		? "dnsrr"
		: "vip";

// Swarm rejects dnsrr for a service that publishes a port through its ingress
// mesh, which is the mode when none is given.
export const withDefaultEndpointMode = <Spec extends EndpointSpecSwarm>(
	spec: Spec,
	mode: SwarmEndpointMode = getSwarmEndpointMode(),
): Spec => {
	if (mode !== "dnsrr" || spec.Mode) return spec;
	if (spec.Ports?.some((port) => port.PublishMode !== "host")) return spec;
	return { ...spec, Mode: "dnsrr" };
};

const publishesThroughIngress = (ports: DefinitionsService["ports"]) =>
	(ports ?? []).some(
		(port) => typeof port !== "object" || port.mode !== "host",
	);

export const applyDefaultStackEndpointMode = (
	compose: ComposeSpecification,
	mode: SwarmEndpointMode = getSwarmEndpointMode(),
) => {
	if (mode !== "dnsrr") return;
	for (const service of Object.values(compose.services ?? {})) {
		if (service.deploy?.endpoint_mode) continue;
		if (publishesThroughIngress(service.ports)) continue;
		service.deploy = { ...service.deploy, endpoint_mode: "dnsrr" };
	}
};
