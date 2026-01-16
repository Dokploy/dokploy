/**
 * Application and service status type
 */
export type ServiceStatus = "idle" | "running" | "done" | "error" | "cancelled";

/**
 * Project model
 */
export interface Project {
	projectId: string;
	name: string;
	description?: string;
	createdAt: string;
	env?: string;
	environments: Environment[];
}

/**
 * Environment model
 */
export interface Environment {
	environmentId: string;
	name: string;
	isDefault: boolean;
	applications: Application[];
	mariadb: any[];
	mongo: any[];
	mysql: any[];
	postgres: any[];
	redis: any[];
	compose: Compose[];
}

/**
 * Application model
 */
export interface Application {
	applicationId: string;
	name: string;
	applicationStatus: ServiceStatus;
	domains: Domain[];
}

/**
 * Compose model
 */
export interface Compose {
	composeId: string;
	name: string;
	composeStatus: ServiceStatus;
	domains: Domain[];
}

/**
 * Domain model
 */
export interface Domain {
	domainId: string;
	host: string;
	path: string;
	https: boolean;
}
