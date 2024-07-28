import _ from "lodash";
import type {
	ComposeSpecification,
	DefinitionsNetwork,
	DefinitionsService,
} from "../types";

export const addPrefixToNetworksRoot = (
	networks: { [key: string]: DefinitionsNetwork },
	prefix: string,
): { [key: string]: DefinitionsNetwork } => {
	return _.mapKeys(networks, (_value, key) => `${key}-${prefix}`);
};

export const addPrefixToServiceNetworks = (
	services: { [key: string]: DefinitionsService },
	prefix: string,
): { [key: string]: DefinitionsService } => {
	return _.mapValues(services, (service) => {
		if (service.networks) {
			// 1 Case the most common
			if (Array.isArray(service.networks)) {
				service.networks = service.networks.map(
					(network: string) => `${network}-${prefix}`,
				);
			} else {
				// 2 Case
				service.networks = _.mapKeys(
					service.networks,
					(_value, key) => `${key}-${prefix}`,
				);

				// 3 Case
				service.networks = _.mapValues(service.networks, (value) => {
					if (value && typeof value === "object") {
						return _.mapKeys(value, (_val, innerKey) => {
							if (innerKey === "aliases") {
								return "aliases";
							}
							return `${innerKey}-${prefix}`;
						});
					}
					return value;
				});
			}
		}
		return service;
	});
};

export const addPrefixToAllNetworks = (
	composeData: ComposeSpecification,
	prefix: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };

	if (updatedComposeData.networks) {
		updatedComposeData.networks = addPrefixToNetworksRoot(
			updatedComposeData.networks,
			prefix,
		);
	}

	if (updatedComposeData.services) {
		updatedComposeData.services = addPrefixToServiceNetworks(
			updatedComposeData.services,
			prefix,
		);
	}

	return updatedComposeData;
};
