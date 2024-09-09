import path from "node:path";
import Docker from "dockerode";

export const BASE_PATH =
	process.env.NODE_ENV === "production"
		? "/etc/dokploy"
		: path.join(process.cwd(), ".docker");
export const IS_CLOUD = process.env.IS_CLOUD === "true";
export const MAIN_TRAEFIK_PATH = `${BASE_PATH}/traefik`;
export const DYNAMIC_TRAEFIK_PATH = `${BASE_PATH}/traefik/dynamic`;
export const LOGS_PATH = `/etc/dokploy/logs`;
export const APPLICATIONS_PATH = `/etc/dokploy/applications`;
export const COMPOSE_PATH = `/etc/dokploy/compose`;
export const SSH_PATH = `${BASE_PATH}/ssh`;
export const CERTIFICATES_PATH = `${DYNAMIC_TRAEFIK_PATH}/certificates`;
export const REGISTRY_PATH = `${DYNAMIC_TRAEFIK_PATH}/registry`;
export const MONITORING_PATH = `${BASE_PATH}/monitoring`;
export const docker = new Docker();

export const getPaths = (basePath: string) => {
	// return [
	// 	MAIN_TRAEFIK_PATH: `${basePath}/traefik`,
	// 	DYNAMIC_TRAEFIK_PATH: `${basePath}/traefik/dynamic`,
	// 	LOGS_PATH: `${basePath}/logs`,
	// 	APPLICATIONS_PATH: `${basePath}/applications`,
	// 	COMPOSE_PATH: `${basePath}/compose`,
	// 	SSH_PATH: `${basePath}/ssh`,
	// 	CERTIFICATES_PATH: `${basePath}/certificates`,
	// 	MONITORING_PATH: `${basePath}/monitoring`,
	// ];

	return [
		`${basePath}/traefik`,
		`${basePath}/traefik/dynamic`,
		`${basePath}/logs`,
		`${basePath}/applications`,
		`${basePath}/compose`,
		`${basePath}/ssh`,
		`${basePath}/certificates`,
		`${basePath}/monitoring`,
	];
};
