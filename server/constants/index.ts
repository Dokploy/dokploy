import Docker from "dockerode";

export const BASE_PATH = "/etc/dokploy";
export const MAIN_TRAEFIK_PATH = `${BASE_PATH}/traefik`;
export const DYNAMIC_TRAEFIK_PATH = `${BASE_PATH}/traefik/dynamic`;
export const LOGS_PATH = `${BASE_PATH}/logs`;
export const APPLICATIONS_PATH = `${BASE_PATH}/applications`;
export const SSH_PATH = `${BASE_PATH}/ssh`;
export const CERTIFICATES_PATH = `${DYNAMIC_TRAEFIK_PATH}/certificates`;
export const MONITORING_PATH = `${BASE_PATH}/monitoring`;
export const docker = new Docker();
