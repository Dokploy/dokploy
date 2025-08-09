import fs, { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Compose } from "@dokploy/server/services/compose";
import type { Domain } from "@dokploy/server/services/domain";
import { dump, load } from "js-yaml";
import { execAsyncRemote } from "../process/execAsync";
import {
	cloneRawBitbucketRepository,
	cloneRawBitbucketRepositoryRemote,
} from "../providers/bitbucket";
import {
	cloneGitRawRepository,
	cloneRawGitRepositoryRemote,
} from "../providers/git";
import {
	cloneRawGiteaRepository,
	cloneRawGiteaRepositoryRemote,
} from "../providers/gitea";
import {
	cloneRawGithubRepository,
	cloneRawGithubRepositoryRemote,
} from "../providers/github";
import {
	cloneRawGitlabRepository,
	cloneRawGitlabRepositoryRemote,
} from "../providers/gitlab";
import {
	createComposeFileRaw,
	createComposeFileRawRemote,
} from "../providers/raw";
import { randomizeDeployableSpecificationFile } from "./collision";
import { randomizeSpecificationFile } from "./compose";
import type {
	ComposeSpecification,
	DefinitionsService,
	PropertiesNetworks,
} from "./types";
import { encodeBase64 } from "./utils";

export const cloneCompose = async (compose: Compose) => {
	if (compose.sourceType === "github") {
		await cloneRawGithubRepository(compose);
	} else if (compose.sourceType === "gitlab") {
		await cloneRawGitlabRepository(compose);
	} else if (compose.sourceType === "bitbucket") {
		await cloneRawBitbucketRepository(compose);
	} else if (compose.sourceType === "git") {
		await cloneGitRawRepository(compose);
	} else if (compose.sourceType === "gitea") {
		await cloneRawGiteaRepository(compose);
	} else if (compose.sourceType === "raw") {
		await createComposeFileRaw(compose);
	}
};

export const cloneComposeRemote = async (compose: Compose) => {
	if (compose.sourceType === "github") {
		await cloneRawGithubRepositoryRemote(compose);
	} else if (compose.sourceType === "gitlab") {
		await cloneRawGitlabRepositoryRemote(compose);
	} else if (compose.sourceType === "bitbucket") {
		await cloneRawBitbucketRepositoryRemote(compose);
	} else if (compose.sourceType === "git") {
		await cloneRawGitRepositoryRemote(compose);
	} else if (compose.sourceType === "gitea") {
		await cloneRawGiteaRepositoryRemote(compose);
	} else if (compose.sourceType === "raw") {
		await createComposeFileRawRemote(compose);
	}
};

export const getComposePath = (compose: Compose) => {
	const { COMPOSE_PATH } = paths(!!compose.serverId);
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

export const loadDockerComposeRemote = async (
	compose: Compose,
): Promise<ComposeSpecification | null> => {
	const path = getComposePath(compose);
	try {
		if (!compose.serverId) {
			return null;
		}
		const { stdout, stderr } = await execAsyncRemote(
			compose.serverId,
			`cat ${path}`,
		);

		if (stderr) {
			return null;
		}
		if (!stdout) return null;
		const parsedConfig = load(stdout) as ComposeSpecification;
		return parsedConfig;
	} catch {
		return null;
	}
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

export const writeDomainsToComposeRemote = async (
	compose: Compose,
	domains: Domain[],
	logPath: string,
) => {
	if (!domains.length) {
		return "";
	}

	try {
		const composeConverted = await addDomainToCompose(compose, domains);
		const path = getComposePath(compose);

		if (!composeConverted) {
			return `
echo "❌ Error: Compose file not found" >> ${logPath};
exit 1;
			`;
		}
		if (compose.serverId) {
			const composeString = dump(composeConverted, { lineWidth: 1000 });
			const encodedContent = encodeBase64(composeString);
			return `echo "${encodedContent}" | base64 -d > "${path}";`;
		}
	} catch (error) {
		// @ts-ignore
		return `echo "❌ Has occured an error: ${error?.message || error}" >> ${logPath};
exit 1;
		`;
	}
};
// (node:59875) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 SIGTERM listeners added to [process]. Use emitter.setMaxListeners() to increase limit
export const addDomainToCompose = async (
	compose: Compose,
	domains: Domain[],
) => {
	const { appName } = compose;

	let result: ComposeSpecification | null;

	if (compose.serverId) {
		result = await loadDockerComposeRemote(compose); // aca hay que ir al servidor e ir a traer el compose file al servidor
	} else {
		result = await loadDockerCompose(compose);
	}

	if (!result || domains.length === 0) {
		return null;
	}

	if (compose.isolatedDeployment) {
		const randomized = randomizeDeployableSpecificationFile(
			result,
			compose.isolatedDeploymentsVolume,
			compose.suffix || compose.appName,
		);
		result = randomized;
	} else if (compose.randomize) {
		const randomized = randomizeSpecificationFile(result, compose.suffix);
		result = randomized;
	}

	for (const domain of domains) {
		const { serviceName, https } = domain;
		if (!serviceName) {
			throw new Error("Service name not found");
		}
		if (!result?.services?.[serviceName]) {
			throw new Error(`The service ${serviceName} not found in the compose`);
		}

		const httpLabels = createDomainLabels(appName, domain, "web");
		if (https) {
			const httpsLabels = createDomainLabels(appName, domain, "websecure");
			httpLabels.push(...httpsLabels);
		}

		let labels: DefinitionsService["labels"] = [];
		if (compose.composeType === "docker-compose") {
			if (!result.services[serviceName].labels) {
				result.services[serviceName].labels = [];
			}

			labels = result.services[serviceName].labels;
		} else {
			// Stack Case
			if (!result.services[serviceName].deploy) {
				result.services[serviceName].deploy = {};
			}
			if (!result.services[serviceName].deploy.labels) {
				result.services[serviceName].deploy.labels = [];
			}

			labels = result.services[serviceName].deploy.labels;
		}

		if (Array.isArray(labels)) {
			if (!labels.includes("traefik.enable=true")) {
				labels.unshift("traefik.enable=true");
			}
			labels.unshift(...httpLabels);
			if (!compose.isolatedDeployment) {
				if (!labels.includes("traefik.docker.network=dokploy-network")) {
					labels.unshift("traefik.docker.network=dokploy-network");
				}
				if (!labels.includes("traefik.swarm.network=dokploy-network")) {
					labels.unshift("traefik.swarm.network=dokploy-network");
				}
			}
		}

		if (!compose.isolatedDeployment) {
			// Add the dokploy-network to the service
			result.services[serviceName].networks = addDokployNetworkToService(
				result.services[serviceName].networks,
			);
		}
	}

	// Add dokploy-network to the root of the compose file
	if (!compose.isolatedDeployment) {
		result.networks = addDokployNetworkToRoot(result.networks);
	}

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

export const createDomainLabels = (
	appName: string,
	domain: Domain,
	entrypoint: "web" | "websecure",
) => {
	const {
		host,
		port,
		https,
		uniqueConfigKey,
		certificateType,
		path,
		customCertResolver,
		stripPath,
		internalPath,
	} = domain;
	const routerName = `${appName}-${uniqueConfigKey}-${entrypoint}`;
	const labels = [
		`traefik.http.routers.${routerName}.rule=Host(\`${host}\`)${path && path !== "/" ? ` && PathPrefix(\`${path}\`)` : ""}`,
		`traefik.http.routers.${routerName}.entrypoints=${entrypoint}`,
		`traefik.http.services.${routerName}.loadbalancer.server.port=${port}`,
		`traefik.http.routers.${routerName}.service=${routerName}`,
	];

	// Collect middlewares for this router
	const middlewares: string[] = [];

	// Add HTTPS redirect for web entrypoint (must be first)
	if (entrypoint === "web" && https) {
		middlewares.push("redirect-to-https@file");
	}

	// Add stripPath middleware if needed
	if (stripPath && path && path !== "/") {
		const middlewareName = `stripprefix-${appName}-${uniqueConfigKey}`;
		// Only define middleware once (on web entrypoint)
		if (entrypoint === "web") {
			labels.push(
				`traefik.http.middlewares.${middlewareName}.stripprefix.prefixes=${path}`,
			);
		}
		middlewares.push(middlewareName);
	}

	// Add internalPath middleware if needed
	if (internalPath && internalPath !== "/" && internalPath.startsWith("/")) {
		const middlewareName = `addprefix-${appName}-${uniqueConfigKey}`;
		// Only define middleware once (on web entrypoint)
		if (entrypoint === "web") {
			labels.push(
				`traefik.http.middlewares.${middlewareName}.addprefix.prefix=${internalPath}`,
			);
		}
		middlewares.push(middlewareName);
	}

	// Apply middlewares to router if any exist
	if (middlewares.length > 0) {
		labels.push(
			`traefik.http.routers.${routerName}.middlewares=${middlewares.join(",")}`,
		);
	}

	// Add TLS configuration for websecure
	if (entrypoint === "websecure") {
		if (certificateType === "letsencrypt") {
			labels.push(
				`traefik.http.routers.${routerName}.tls.certresolver=letsencrypt`,
			);
		} else if (certificateType === "custom" && customCertResolver) {
			labels.push(
				`traefik.http.routers.${routerName}.tls.certresolver=${customCertResolver}`,
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
