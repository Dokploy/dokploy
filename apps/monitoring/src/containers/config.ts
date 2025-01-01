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

        const parsedConfig = JSON.parse(configJson);
        return parsedConfig;
    } catch (error) {
        console.error("Error loading config:", error);
        return DEFAULT_CONFIG;
    }
};

export const getServiceName = (containerName: string): string => {
    const match = containerName.match(/^([\w-]+(?:_[\w-]+)*)(?:\.\d+\.[a-z0-9]+)?$/);
    return match ? match[1] : containerName;
};

export const shouldMonitorContainer = (containerName: string, config: MonitoringConfig): boolean => {
    const { includeServices, excludeServices } = config;
    const serviceName = getServiceName(containerName);

    // If specifically included, always monitor
    if (includeServices.some((service) => service.appName === serviceName)) {
        return true;
    }

    // If there's a wildcard in includeServices and not specifically excluded
    if (
        includeServices.some((service) => service.appName === "*") &&
        !excludeServices.includes(serviceName)
    ) {
        return true;
    }

    // In any other case, don't monitor
    return false;
};

export const getContainerConfig = (containerName: string, config: MonitoringConfig): ServiceConfig => {
    const serviceName = getServiceName(containerName);
    const { includeServices } = config;

    // If it has specific configuration, use it
    const specificConfig = includeServices.find(
        (service) => service.appName === serviceName,
    );
    if (specificConfig) {
        return specificConfig;
    }

    // If not, use default configuration (wildcard)
    const wildcardConfig = includeServices.find(
        (service) => service.appName === "*",
    );
    return wildcardConfig || { appName: "*", maxFileSizeMB: 10 };
};
