import _ from "lodash";
import type {
	ComposeSpecification,
	DefinitionsNetwork,
	DefinitionsService,
} from "../types";

export const addSuffixToNetworksRoot = (
	networks: { [key: string]: DefinitionsNetwork },
	suffix: string,
): { [key: string]: DefinitionsNetwork } => {
	return _.mapKeys(networks, (_value, key) => {
		if (key === "dokploy-network") {
			return "dokploy-network";
		}
		return `${key}-${suffix}`;
	});
};

export const addSuffixToServiceNetworks = (
	services: { [key: string]: DefinitionsService },
	suffix: string,
): { [key: string]: DefinitionsService } => {
	return _.mapValues(services, (service) => {
		if (service.networks) {
			// 1 Case the most common
			if (Array.isArray(service.networks)) {
				service.networks = service.networks.map((network: string) => {
					if (network === "dokploy-network") {
						return "dokploy-network";
					}
					return `${network}-${suffix}`;
				});
			} else {
				// 2 Case
				service.networks = _.mapKeys(service.networks, (_value, key) => {
					if (key === "dokploy-network") {
						return "dokploy-network";
					}
					return `${key}-${suffix}`;
				});

				// 3 Case
				service.networks = _.mapValues(service.networks, (value) => {
					if (value && typeof value === "object") {
						return _.mapKeys(value, (_val, innerKey) => {
							if (innerKey === "aliases") {
								return "aliases";
							}
							return `${innerKey}-${suffix}`;
						});
					}

					return value;
				});
			}
		}
		return service;
	});
};

export const addSuffixToAllNetworks = (
	composeData: ComposeSpecification,
	suffix: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };

	if (updatedComposeData.networks) {
		updatedComposeData.networks = addSuffixToNetworksRoot(
			updatedComposeData.networks,
			suffix,
		);
	}

	if (updatedComposeData.services) {
		updatedComposeData.services = addSuffixToServiceNetworks(
			updatedComposeData.services,
			suffix,
		);
	}

	return updatedComposeData;
};
