import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mapboxApiKey = "";
	const secretKey = generatePassword(30);
	const postgresDb = "superset";
	const postgresUser = "superset";
	const postgresPassword = generatePassword(30);
	const redisPassword = generatePassword(30);

	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 8088,
			serviceName: "superset",
		},
	];

	const envs = [
		`SECRET_KEY=${secretKey}`,
		`MAPBOX_API_KEY=${mapboxApiKey}`,
		`POSTGRES_DB=${postgresDb}`,
		`POSTGRES_USER=${postgresUser}`,
		`POSTGRES_PASSWORD=${postgresPassword}`,
		`REDIS_PASSWORD=${redisPassword}`,
	];

	return {
		envs,
		domains,
	};
}
