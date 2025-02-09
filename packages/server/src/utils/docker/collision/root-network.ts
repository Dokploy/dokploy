import _ from "lodash";
import type { ComposeSpecification, DefinitionsService } from "../types";

export const addAppNameToRootNetwork = (
	composeData: ComposeSpecification,
	appName: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };

	// Initialize networks if it doesn't exist
	if (!updatedComposeData.networks) {
		updatedComposeData.networks = {};
	}

	// Add the new network with the app name
	updatedComposeData.networks[appName] = {
		name: appName,
		external: true,
	};

	return updatedComposeData;
};

export const addAppNameToServiceNetworks = (
	services: { [key: string]: DefinitionsService },
	appName: string,
): { [key: string]: DefinitionsService } => {
	return _.mapValues(services, (service) => {
		if (!service.networks) {
			service.networks = [appName];
			return service;
		}

		if (Array.isArray(service.networks)) {
			if (!service.networks.includes(appName)) {
				service.networks.push(appName);
			}
		} else {
			service.networks[appName] = {};
		}

		return service;
	});
};

export const addAppNameToAllServiceNames = (
	composeData: ComposeSpecification,
	appName: string,
): ComposeSpecification => {
	let updatedComposeData = { ...composeData };

	updatedComposeData = addAppNameToRootNetwork(updatedComposeData, appName);

	if (updatedComposeData.services) {
		updatedComposeData.services = addAppNameToServiceNetworks(
			updatedComposeData.services,
			appName,
		);
	}

	return updatedComposeData;
};
