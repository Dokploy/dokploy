import { config as dotenvConfig } from "dotenv";
import type { MonitoringConfig, ServiceConfig } from "./types.js";

dotenvConfig();

// Default configuration
export const DEFAULT_CONFIG: MonitoringConfig = {
	includeServices: [
		{
			appName: "*",
			maxFileSizeMB: 10,
		},
	],
	excludeServices: [],
};

export const loadConfig = (): MonitoringConfig => {
	try {
		const configJson = process.env.CONTAINER_MONITORING_CONFIG;

		if (!configJson) {
			return DEFAULT_CONFIG;
		}

		const unescapedJson = configJson.replace(/\\/g, "");
		const parsedConfig = JSON.parse(unescapedJson);

		return parsedConfig;
	} catch (error) {
		console.error("Error loading config:", error);
		return DEFAULT_CONFIG;
	}
};

export const getServiceName = (containerName: string): string => {
	// Para contenedores de Docker Swarm (ej: dokploy-postgres.1.2rfdhwsjhm82wai9hm9dp4sqn)
	const swarmMatch = containerName.match(/^([^.]+)(?:\.\d+\.[a-z0-9]+)?$/);
	if (swarmMatch) return swarmMatch[1];

	return containerName;
};

export const shouldMonitorContainer = (containerName: string): boolean => {
	const config = loadConfig();
	const { includeServices } = config;
	const serviceName = getServiceName(containerName);

	// Verificar si el nombre del servicio coincide exactamente con alguno configurado
	return includeServices.some((service) => {
		// Si el appName es exactamente igual al nombre del servicio
		if (service.appName === serviceName) return true;

		// Si el servicio comienza con el appName
		if (serviceName.startsWith(service.appName)) return true;

		return false;
	});
};

export const getContainerConfig = (containerName: string): ServiceConfig => {
	const config = loadConfig();
	const { includeServices } = config;
	const serviceName = getServiceName(containerName);

	// Buscar la configuración que coincida con el servicio
	const specificConfig = includeServices.find((service) => {
		if (service.appName === serviceName) return true;
		if (serviceName.startsWith(service.appName)) return true;
		return false;
	});

	return specificConfig || { appName: "*", maxFileSizeMB: 10 };
};
