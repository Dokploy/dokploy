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

export const addPrefixToServiceNetworks = (
	services: { [key: string]: any },
	prefix: string,
): { [key: string]: any } => {
	const newServices = { ...services };
	for (const [serviceKey, serviceValue] of Object.entries(newServices)) {
		if (serviceValue.networks) {
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
		updatedComposeData.services = addPrefixToServiceNetworks(
			updatedComposeData.services,
			prefix,
		);
	}

	return updatedComposeData;
};
