import path from "node:path";
import Docker from "dockerode";

export const BASE_PATH =
	process.env.NODE_ENV === "production"
		? "/etc/dokploy"
		: path.join(process.cwd(), ".docker");
export const MAIN_TRAEFIK_PATH = `${BASE_PATH}/traefik`;
export const DYNAMIC_TRAEFIK_PATH = `${BASE_PATH}/traefik/dynamic`;
export const LOGS_PATH = `${BASE_PATH}/logs`;
export const APPLICATIONS_PATH = `${BASE_PATH}/applications`;
export const COMPOSE_PATH = `${BASE_PATH}/compose`;
export const SSH_PATH = `${BASE_PATH}/ssh`;
export const CERTIFICATES_PATH = `${DYNAMIC_TRAEFIK_PATH}/certificates`;
export const REGISTRY_PATH = `${DYNAMIC_TRAEFIK_PATH}/registry`;
export const MONITORING_PATH = `${BASE_PATH}/monitoring`;
export const docker = new Docker();
