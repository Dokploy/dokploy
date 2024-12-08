import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);

	const apiKey = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const encryptionKey = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const jwtSecret = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const couchDbPassword = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const redisPassword = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const minioAccessKey = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const minioSecretKey = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");
	const watchtowerPassword = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 16).toString(16),
	).join("");

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 10000,
			serviceName: "proxy",
		},
	];

	const envs = [
		`BB_HOST=${mainDomain}`,
		`BB_INTERNAL_API_KEY=${apiKey}`,
		`BB_API_ENCRYPTION_KEY=${encryptionKey}`,
		`BB_JWT_SECRET=${jwtSecret}`,
		`BB_COUCHDB_PASSWORD=${couchDbPassword}`,
		`BB_REDIS_PASSWORD=${redisPassword}`,
		`BB_WATCHTOWER_PASSWORD=${watchtowerPassword}`,
		`BB_MINIO_ACCESS_KEY=${minioAccessKey}`,
		`BB_MINIO_SECRET_KEY=${minioSecretKey}`,
	];

	return {
		domains,
		envs,
	};
}
