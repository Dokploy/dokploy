import fs, { existsSync, readFileSync, writeSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Compose } from "@/server/api/services/compose";
import type { Domain } from "@/server/api/services/domain";
import { COMPOSE_PATH } from "@/server/constants";
import { dump, load } from "js-yaml";
import { cloneGitRawRepository } from "../providers/git";
import { cloneRawGithubRepository } from "../providers/github";
import { createComposeFileRaw } from "../providers/raw";
import type {
	ComposeSpecification,
	DefinitionsService,
	PropertiesNetworks,
} from "./types";

export const cloneCompose = async (compose: Compose) => {
	if (compose.sourceType === "github") {
		await cloneRawGithubRepository(compose);
	} else if (compose.sourceType === "git") {
		await cloneGitRawRepository(compose);
	} else if (compose.sourceType === "raw") {
		await createComposeFileRaw(compose);
	}
};

export const getComposePath = (compose: Compose) => {
	const { appName, sourceType, composePath } = compose;
	let path = "";

	if (sourceType === "raw") {
		path = "docker-compose.yml";
	} else {
		path = composePath;
	}

	return join(COMPOSE_PATH, appName, "code", path);
};

export const loadDockerCompose = async (
	compose: Compose,
): Promise<ComposeSpecification | null> => {
	const path = getComposePath(compose);

	if (existsSync(path)) {
		const yamlStr = readFileSync(path, "utf8");
		const parsedConfig = load(yamlStr) as ComposeSpecification;
		return parsedConfig;
	}
	return null;
};

export const readComposeFile = async (compose: Compose) => {
	const path = getComposePath(compose);
	if (existsSync(path)) {
		const yamlStr = readFileSync(path, "utf8");
		return yamlStr;
	}
	return null;
};

export const writeDomainsToCompose = async (
	compose: Compose,
	domains: Domain[],
) => {
	if (!domains.length) {
		return;
	}
	const composeConverted = await addDomainToCompose(compose, domains);

	const path = getComposePath(compose);
	const composeString = dump(composeConverted, { lineWidth: 1000 });
	try {
		await writeFile(path, composeString, "utf8");
	} catch (error) {
		throw error;
	}
};

export const addDomainToCompose = async (
	compose: Compose,
	domains: Domain[],
) => {
	const { appName } = compose;
	const result = await loadDockerCompose(compose);

	if (!result || domains.length === 0) {
		return null;
	}

	for (const domain of domains) {
		const { serviceName, https } = domain;
		if (!serviceName) {
			throw new Error("Service name not found");
		}
		if (!result?.services?.[serviceName]) {
			throw new Error(`The service ${serviceName} not found in the compose`);
		}
		if (!result.services[serviceName].labels) {
			result.services[serviceName].labels = [];
		}

		const httpLabels = await createDomainLabels(appName, domain, "web");
		if (https) {
			const httpsLabels = await createDomainLabels(
				appName,
				domain,
				"websecure",
			);
			httpLabels.push(...httpsLabels);
		}

		const labels = result.services[serviceName].labels;

		if (Array.isArray(labels)) {
			if (!labels.includes("traefik.enable=true")) {
				labels.push("traefik.enable=true");
			}
			labels.push(...httpLabels);
		}

		// Add the dokploy-network to the service
		result.services[serviceName].networks = addDokployNetworkToService(
			result.services[serviceName].networks,
		);
	}

	// Add dokploy-network to the root of the compose file
	result.networks = addDokployNetworkToRoot(result.networks);

	return result;
};

export const writeComposeFile = async (
	compose: Compose,
	composeSpec: ComposeSpecification,
) => {
	const path = getComposePath(compose);

	try {
		const composeFile = dump(composeSpec, {
			lineWidth: 1000,
		});
		fs.writeFileSync(path, composeFile, "utf8");
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};

export const createDomainLabels = async (
	appName: string,
	domain: Domain,
	entrypoint: "web" | "websecure",
) => {
	const { host, port, https, uniqueConfigKey, certificateType } = domain;
	const routerName = `${appName}-${uniqueConfigKey}-${entrypoint}`;
	const labels = [
		`traefik.http.routers.${routerName}.rule=Host(\`${host}\`)`,
		`traefik.http.routers.${routerName}.entrypoints=${entrypoint}`,
		`traefik.http.services.${routerName}.loadbalancer.server.port=${port}`,
		`traefik.http.routers.${routerName}.service=${routerName}`,
	];

	if (entrypoint === "web" && https) {
		labels.push(
			`traefik.http.routers.${routerName}.middlewares=redirect-to-https@file`,
		);
	}

	if (entrypoint === "websecure") {
		if (certificateType === "letsencrypt") {
			labels.push(
				`traefik.http.routers.${routerName}.tls.certresolver=letsencrypt`,
			);
		}
	}

	return labels;
};

export const addDokployNetworkToService = (
	networkService: DefinitionsService["networks"],
) => {
	let networks = networkService;
	const network = "dokploy-network";
	if (!networks) {
		networks = [];
	}

	if (Array.isArray(networks)) {
		if (!networks.includes(network)) {
			networks.push(network);
		}
	} else if (networks && typeof networks === "object") {
		if (!(network in networks)) {
			networks[network] = {};
		}
	}

	return networks;
};

export const addDokployNetworkToRoot = (
	networkRoot: PropertiesNetworks | undefined,
) => {
	let networks = networkRoot;
	const network = "dokploy-network";

	if (!networks) {
		networks = {};
	}

	if (networks[network] || !networks[network]) {
		networks[network] = {
			external: true,
		};
	}

	return networks;
};
