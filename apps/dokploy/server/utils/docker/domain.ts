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
import type { ComposeSpecification } from "./types";

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

	if (!result) {
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

		if (Array.isArray(result.services[serviceName].labels)) {
			const haveTraefikEnableLabel = result.services[
				serviceName
			].labels.includes("traefik.enable=true");

			if (!haveTraefikEnableLabel) {
				result.services[serviceName].labels.push("traefik.enable=true");
			}
			result.services[serviceName].labels.push(...httpLabels);
		}
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

export const createDomainLabels = async (
	appName: string,
	domain: Domain,
	entrypoint: "web" | "websecure",
) => {
	const { host, port, https, uniqueConfigKey, certificateType } = domain;

	const labels = [
		`traefik.http.routers.${appName}-${uniqueConfigKey}-${entrypoint}.rule=Host(\`${host}\`)`,
		`traefik.http.services.${appName}-${uniqueConfigKey}-${entrypoint}.loadbalancer.server.port=${port}`,
		`traefik.http.routers.${appName}-${uniqueConfigKey}-${entrypoint}.entrypoints=${entrypoint}`,
	];

	if (entrypoint === "web" && https) {
		labels.push(
			"traefik.http.routers.redirect-to-https.middlewares=redirect-to-https",
		);
	}

	if (entrypoint === "websecure") {
		if (certificateType === "letsencrypt") {
			labels.push(
				"traefik.http.routers.letsencrypt.tls.certresolver=letsencrypt",
			);
		} else if (certificateType === "none") {
			labels.push("traefik.http.routers.letsencrypt.tls=null");
		}
	}

	return labels;
};
