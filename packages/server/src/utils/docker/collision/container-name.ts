import type { ComposeSpecification, DefinitionsService } from "../types";
import _ from "lodash";

export const addAppNameToContainerNames = (
	services: { [key: string]: DefinitionsService },
	appName: string,
): { [key: string]: DefinitionsService } => {
	return _.mapValues(services, (service, serviceName) => {
		service.container_name = `${appName}-${serviceName}`;
		return service;
	});
};

export const addAppNameToAllContainerNames = (
	composeData: ComposeSpecification,
	appName: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };
	if (updatedComposeData.services) {
		updatedComposeData.services = addAppNameToContainerNames(
			updatedComposeData.services,
			appName,
		);
	}
	return updatedComposeData;
};
