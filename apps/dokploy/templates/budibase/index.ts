import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);

	const apiKey = generatePassword(32);
	const encryptionKey = generatePassword(32);
	const jwtSecret = generatePassword(32);
	const couchDbPassword = generatePassword(32);
	const redisPassword = generatePassword(32);
	const minioAccessKey = generatePassword(32);
	const minioSecretKey = generatePassword(32);
	const watchtowerPassword = generatePassword(32);

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
