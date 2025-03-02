import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const dbPassword = generatePassword();
	const dbUser = "immich";
	const appSecret = generateBase64(32);

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 2283,
			serviceName: "immich-server",
		},
	];

	const envs = [
		`IMMICH_HOST=${mainDomain}`,
		`SERVER_URL=https://${mainDomain}`,
		`FRONT_BASE_URL=https://${mainDomain}`,
		"# Database Configuration",
		"DB_HOSTNAME=immich-database",
		"DB_PORT=5432",
		`DB_USERNAME=${dbUser}`,
		`DB_PASSWORD=${dbPassword}`,
		"DB_DATABASE_NAME=immich",
		"# Redis Configuration",
		"REDIS_HOSTNAME=immich-redis",
		"REDIS_PORT=6379",
		"REDIS_DBINDEX=0",
		"# Server Configuration",
		"TZ=UTC",
	];

	return {
		domains,
		envs,
	};
}
