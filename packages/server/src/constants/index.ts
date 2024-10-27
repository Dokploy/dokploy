import path from "node:path";
import Docker from "dockerode";

export const IS_CLOUD = process.env.IS_CLOUD === "true";
export const docker = new Docker();

export const paths = (isServer = false) => {
	if (isServer) {
		const BASE_PATH = "/etc/dokploy";
		return {
			BASE_PATH,
			MAIN_TRAEFIK_PATH: `${BASE_PATH}/traefik`,
			DYNAMIC_TRAEFIK_PATH: `${BASE_PATH}/traefik/dynamic`,
			LOGS_PATH: `${BASE_PATH}/logs`,
			APPLICATIONS_PATH: `${BASE_PATH}/applications`,
			COMPOSE_PATH: `${BASE_PATH}/compose`,
			SSH_PATH: `${BASE_PATH}/ssh`,
			CERTIFICATES_PATH: `${BASE_PATH}/certificates`,
			MONITORING_PATH: `${BASE_PATH}/monitoring`,
			REGISTRY_PATH: `${BASE_PATH}/registry`,
		};
	}
	const BASE_PATH =
		process.env.NODE_ENV === "production"
			? "/etc/dokploy"
			: path.join(process.cwd(), ".docker");
	return {
		BASE_PATH,
		MAIN_TRAEFIK_PATH: `${BASE_PATH}/traefik`,
		DYNAMIC_TRAEFIK_PATH: `${BASE_PATH}/traefik/dynamic`,
		LOGS_PATH: `${BASE_PATH}/logs`,
		APPLICATIONS_PATH: `${BASE_PATH}/applications`,
		COMPOSE_PATH: `${BASE_PATH}/compose`,
		SSH_PATH: `${BASE_PATH}/ssh`,
		CERTIFICATES_PATH: `${BASE_PATH}/certificates`,
		MONITORING_PATH: `${BASE_PATH}/monitoring`,
		REGISTRY_PATH: `${BASE_PATH}/registry`,
	};
};