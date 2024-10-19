import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3030,
			serviceName: "Flowise",
		},
	];
	const envs = [
		"PORT=3030",
    "DATABASE_PATH=/root/.flowise",
    "APIKEY_PATH=/root/.flowise",
    "SECRETKEY_PATH=/root/.flowise",
    "LOG_PATH=/root/.flowise/logs",
    "BLOB_STORAGE_PATH=/root/.flowise/storage",
		"GENERIC_TIMEZONE=Europe/Berlin",
    "# FLOWISE_USERNAME=admin",
    "# FLOWISE_PASSWORD=passwd",
	];

	return {
		envs,
		domains,
	};
}
