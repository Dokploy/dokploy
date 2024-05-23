/*
Ejemplo de Docker Compose File:
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend
      - backend

  app:
    image: node:14
    networks:
      - backend
      - frontend

networks:
  frontend:
  backend:

En este caso, la función `addPrefixToNetworks` añadirá el prefijo a `frontend` y `backend` en la sección `networks`.
*/

import type { ComposeSpecification } from "../types";

export const addPrefixToNetworksRoot = (
	networks: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newNetworks: { [key: string]: any } = {};
	for (const [key, value] of Object.entries(networks)) {
		const newKey = `${key}-${prefix}`;
		newNetworks[newKey] = value;
	}
	return newNetworks;
};

export const addPrefixToStringNetworks = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceKey, serviceValue] of Object.entries(newServices)) {
		if (Array.isArray(serviceValue.networks)) {
			const updatedNetworks = serviceValue.networks.map((network: string) => {
				if (!network.startsWith("${")) {
					return `${network}-${prefix}`;
				}
				return network;
			});
			newServices[serviceKey].networks = updatedNetworks;
		}
	}
	return newServices;
};

export const addPrefixToObjectNetworks = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceKey, serviceValue] of Object.entries(newServices)) {
		if (
			serviceValue.networks &&
			typeof serviceValue.networks === "object" &&
			!Array.isArray(serviceValue.networks)
		) {
			const updatedNetworks = Object.entries(serviceValue.networks).reduce(
				(acc: any, [networkKey, networkValue]) => {
					if (networkValue?.aliases) {
						const updatedNetworkValue = { ...networkValue };
						updatedNetworkValue.aliases = networkValue.aliases.map(
							(alias: string) => {
								if (!alias.startsWith("${")) {
									return `${alias}-${prefix}`;
								}
								return alias;
							},
						);
						acc[`${networkKey}-${prefix}`] = updatedNetworkValue;
					} else {
						acc[`${networkKey}-${prefix}`] = networkValue;
					}
					return acc;
				},
				{},
			);

			newServices[serviceKey].networks = updatedNetworks;
		}
	}
	return newServices;
};

export const addPrefixToSimpleObjectNetworks = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceKey, serviceValue] of Object.entries(newServices)) {
		if (
			serviceValue.networks &&
			typeof serviceValue.networks === "object" &&
			!Array.isArray(serviceValue.networks)
		) {
			const updatedNetworks = Object.entries(serviceValue.networks).reduce(
				(acc: any, [networkKey, networkValue]) => {
					// Solo agregar prefijo si networkValue es null o undefined (indica un objeto simple)
					if (networkValue === null || networkValue === undefined) {
						acc[`${networkKey}-${prefix}`] = networkValue;
					} else {
						acc[networkKey] = networkValue; // mantener la red original si no es un objeto simple
					}
					return acc;
				},
				{},
			);
			newServices[serviceKey].networks = updatedNetworks;
		}
	}
	return newServices;
};

/*
Ejemplo de Docker Compose File:
version: "3.8"
services:
  db:
    image: postgres:13
    networks:
      - backend

  app:
    image: node:14
    networks:
      - backend
      - frontend

networks:
  frontend:
  backend:

En este caso, la función `addPrefixToServiceNetworks` añadirá el prefijo a `backend` y `frontend` dentro de los servicios `db` y `app`.
*/
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
		updatedComposeData.services = addPrefixToStringNetworks(
			updatedComposeData.services,
			prefix,
		);
	}

	if (updatedComposeData.services) {
		updatedComposeData.services = addPrefixToObjectNetworks(
			updatedComposeData.services,
			prefix,
		);
	}

	if (updatedComposeData.services) {
		updatedComposeData.services = addPrefixToSimpleObjectNetworks(
			updatedComposeData.services,
			prefix,
		);
	}

	console.log(updatedComposeData.services);

	return updatedComposeData;
};
