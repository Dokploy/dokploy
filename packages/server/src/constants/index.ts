import fs from "node:fs";
import path from "node:path";
import Docker from "dockerode";

export const IS_CLOUD = process.env.IS_CLOUD === "true";

export const DOKPLOY_DOCKER_API_VERSION =
	process.env.DOKPLOY_DOCKER_API_VERSION;
export const DOKPLOY_DOCKER_HOST = process.env.DOKPLOY_DOCKER_HOST;
export const DOKPLOY_DOCKER_PORT = process.env.DOKPLOY_DOCKER_PORT
	? Number(process.env.DOKPLOY_DOCKER_PORT)
	: undefined;

export const CLEANUP_CRON_JOB = "50 23 * * *";
export const ACCESS_LOG_RETAINED_LINES = 1000;

type DockerSocketCandidate = {
	label: string;
	path: string;
};

const getDockerConfig = (): Docker => {
	const versionOption = DOKPLOY_DOCKER_API_VERSION
		? { version: DOKPLOY_DOCKER_API_VERSION }
		: {};

	// Explicit remote Docker host configuration
	if (DOKPLOY_DOCKER_HOST) {
		console.info(
			`Using remote Docker host: ${DOKPLOY_DOCKER_HOST}${DOKPLOY_DOCKER_PORT ? `:${DOKPLOY_DOCKER_PORT}` : ""}`,
		);
		return new Docker({
			host: DOKPLOY_DOCKER_HOST,
			...(DOKPLOY_DOCKER_PORT && { port: DOKPLOY_DOCKER_PORT }),
			...versionOption,
		});
	}

	// Local socket auto-detection (Rancher Desktop, Colima, standard Docker)
	const dockerSocketCandidates: Array<DockerSocketCandidate> = [];

	if (process.env.DOCKER_HOST) {
		dockerSocketCandidates.push({
			label: "DOCKER_HOST environment variable",
			path: process.env.DOCKER_HOST.replace("unix://", ""),
		});
	}

	if (process.env.HOME) {
		dockerSocketCandidates.push({
			label: "Rancher Desktop socket",
			path: `${process.env.HOME}/.rd/docker.sock`,
		});
	}

	dockerSocketCandidates.push({
		label: "Standard Docker socket",
		path: "/var/run/docker.sock",
	});

	for (const candidate of dockerSocketCandidates) {
		try {
			if (candidate.path && fs.existsSync(candidate.path)) {
				console.info(
					`Using Docker socket (${candidate.label}): ${candidate.path}`,
				);
				return new Docker({
					socketPath: candidate.path,
					...versionOption,
				});
			}
		} catch (e) {
			console.info(
				`Docker socket initialization failed for ${candidate.label} (${candidate.path}): ${e instanceof Error ? e.message : "Unknown error"}`,
			);
		}
	}

	console.info(
		"Using default Docker configuration. You can set the DOCKER_HOST environment variable to specify a custom Docker socket path.",
	);
	return new Docker({ ...versionOption });
};

export const docker = getDockerConfig();

export const paths = (isServer = false) => {
	const BASE_PATH =
		isServer || process.env.NODE_ENV === "production"
			? "/etc/dokploy"
			: path.join(process.cwd(), ".docker");
	const MAIN_TRAEFIK_PATH = `${BASE_PATH}/traefik`;
	const DYNAMIC_TRAEFIK_PATH = `${MAIN_TRAEFIK_PATH}/dynamic`;
	const MAIN_CADDY_PATH = `${BASE_PATH}/caddy`;
	const CADDY_CONFIG_PATH = `${MAIN_CADDY_PATH}/caddy.json`;
	const CADDY_FRAGMENTS_PATH = `${MAIN_CADDY_PATH}/fragments`;
	const CADDY_ACCESS_LOG_PATH = `${MAIN_CADDY_PATH}/access.log`;
	const CADDY_DATA_PATH = `${MAIN_CADDY_PATH}/data`;
	const CADDY_CONFIG_DIR_PATH = `${MAIN_CADDY_PATH}/config`;
	const CADDY_MIGRATIONS_PATH = `${MAIN_CADDY_PATH}/migrations`;

	return {
		BASE_PATH,
		MAIN_TRAEFIK_PATH,
		DYNAMIC_TRAEFIK_PATH,
		MAIN_CADDY_PATH,
		CADDY_CONFIG_PATH,
		CADDY_FRAGMENTS_PATH,
		CADDY_ACCESS_LOG_PATH,
		CADDY_DATA_PATH,
		CADDY_CONFIG_DIR_PATH,
		CADDY_MIGRATIONS_PATH,
		LOGS_PATH: `${BASE_PATH}/logs`,
		APPLICATIONS_PATH: `${BASE_PATH}/applications`,
		COMPOSE_PATH: `${BASE_PATH}/compose`,
		SSH_PATH: `${BASE_PATH}/ssh`,
		CERTIFICATES_PATH: `${DYNAMIC_TRAEFIK_PATH}/certificates`,
		MONITORING_PATH: `${BASE_PATH}/monitoring`,
		REGISTRY_PATH: `${BASE_PATH}/registry`,
		SCHEDULES_PATH: `${BASE_PATH}/schedules`,
		VOLUME_BACKUPS_PATH: `${BASE_PATH}/volume-backups`,
		VOLUME_BACKUP_LOCK_PATH: `${BASE_PATH}/volume-backup-lock`,
		PATCH_REPOS_PATH: `${BASE_PATH}/patch-repos`,
	};
};
