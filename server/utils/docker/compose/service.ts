// En la sección depends_on de otros servicios: Para definir dependencias entre servicios.
// En la sección networks de otros servicios: Aunque esto no es común, es posible referenciar servicios en redes personalizadas.
// En la sección volumes_from de otros servicios: Para reutilizar volúmenes definidos por otro servicio.
// En la sección links de otros servicios: Para crear enlaces entre servicios.
// En la sección extends de otros servicios: Para extender la configuración de otro servicio.

import { ComposeSpecification } from "../types";

export const addPrefixToDependsOn = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceName, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.depends_on) {
			newServices[serviceName].depends_on = serviceValue.depends_on.map(
				(dep: string) => `${dep}-${prefix}`,
			);
		}
	}
	return newServices;
};

export const addPrefixToVolumesFrom = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceName, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.volumes_from) {
			newServices[serviceName].volumes_from = serviceValue.volumes_from.map(
				(vol: string) => `${vol}-${prefix}`,
			);
		}
	}
	return newServices;
};

export const addPrefixToLinks = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceName, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.links) {
			newServices[serviceName].links = serviceValue.links.map(
				(link: string) => `${link}-${prefix}`,
			);
		}
	}
	return newServices;
};

export const addPrefixToExtends = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceName, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.extends?.service) {
			newServices[serviceName].extends.service =
				`${serviceValue.extends.service}-${prefix}`;
		}
	}
	return newServices;
};

export const addPrefixToServiceNamesRoot = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices: { [key: string]: any } = {};
	for (const [serviceName, serviceValue] of Object.entries(services)) {
		const newServiceName = `${serviceName}-${prefix}`;
		newServices[newServiceName] = serviceValue;
	}
	return newServices;
};

export const addPrefixToContainerNames = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceKey, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.container_name) {
			serviceValue.container_name = `${serviceValue.container_name}-${prefix}`;
		}
	}
	return newServices;
};

export const addPrefixToAllServiceNames = (
	composeData: ComposeSpecification,
	prefix: string,
): ComposeSpecification => {
	const updatedComposeData = { ...composeData };

	if (updatedComposeData.services) {
		updatedComposeData.services = addPrefixToServiceNamesRoot(
			updatedComposeData.services,
			prefix,
		);
		updatedComposeData.services = addPrefixToDependsOn(
			updatedComposeData.services,
			prefix,
		);
		updatedComposeData.services = addPrefixToVolumesFrom(
			updatedComposeData.services,
			prefix,
		);
		updatedComposeData.services = addPrefixToLinks(
			updatedComposeData.services,
			prefix,
		);
		updatedComposeData.services = addPrefixToExtends(
			updatedComposeData.services,
			prefix,
		);

		updatedComposeData.services = addPrefixToContainerNames(
			updatedComposeData.services,
			prefix,
		);
	}

	return updatedComposeData;
};
