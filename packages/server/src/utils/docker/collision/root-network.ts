import { inArray } from "drizzle-orm";
import _ from "lodash";
import { db } from "../../../db";
import { networks } from "../../../db/schema";
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

const addCustomNetworksToServices = (
	services: { [key: string]: DefinitionsService },
	networkNames: string[],
): { [key: string]: DefinitionsService } => {
	return _.mapValues(services, (service) => {
		if (!service.networks) {
			service.networks = [...networkNames];
			return service;
		}

		if (Array.isArray(service.networks)) {
			for (const networkName of networkNames) {
				if (!service.networks.includes(networkName)) {
					service.networks.push(networkName);
				}
			}
		} else {
			for (const networkName of networkNames) {
				if (!service.networks[networkName]) {
					service.networks[networkName] = {};
				}
			}
		}

		return service;
	});
};

export const addCustomNetworksToCompose = async (
	composeData: ComposeSpecification,
	customNetworkIds: string[],
): Promise<ComposeSpecification> => {
	const updatedComposeData = { ...composeData };

	if (!updatedComposeData.networks) {
		updatedComposeData.networks = {};
	}

	// Fetch network details from DB
	const customNetworks = await db.query.networks.findMany({
		where: inArray(networks.networkId, customNetworkIds),
	});

	// Add each custom network to compose
	for (const network of customNetworks) {
		updatedComposeData.networks[network.networkName] = {
			name: network.networkName,
			external: true,
		};
	}

	// Add custom networks to all services
	if (updatedComposeData.services) {
		updatedComposeData.services = addCustomNetworksToServices(
			updatedComposeData.services,
			customNetworks.map((n) => n.networkName),
		);
	}

	return updatedComposeData;
};
