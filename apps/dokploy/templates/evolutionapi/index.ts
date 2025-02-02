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
	const apiKey = generateBase64(64);
	const postgresPassword = generatePassword();

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8080,
			serviceName: "evolution-api",
		},
	];

	const envs = [
		`SERVER_URL=https://${mainDomain}`,
		"AUTHENTICATION_TYPE=apikey",
		`AUTHENTICATION_API_KEY=${apiKey}`,
		"AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true",

		"LANGUAGE=en",
		"CONFIG_SESSION_PHONE_CLIENT=Evolution API",
		"CONFIG_SESSION_PHONE_NAME=Chrome",
		"TELEMETRY=false",
		"TELEMETRY_URL=",

		"POSTGRES_DATABASE=evolution",
		"POSTGRES_USERNAME=postgresql",
		`POSTGRES_PASSWORD=${postgresPassword}`,
		"DATABASE_ENABLED=true",
		"DATABASE_PROVIDER=postgresql",
		`DATABASE_CONNECTION_URI=postgres://postgresql:${postgresPassword}@evolution-postgres:5432/evolution`,
		"DATABASE_SAVE_DATA_INSTANCE=true",
		"DATABASE_SAVE_DATA_NEW_MESSAGE=true",
		"DATABASE_SAVE_MESSAGE_UPDATE=true",
		"DATABASE_SAVE_DATA_CONTACTS=true",
		"DATABASE_SAVE_DATA_CHATS=true",
		"DATABASE_SAVE_DATA_LABELS=true",
		"DATABASE_SAVE_DATA_HISTORIC=true",

		"CACHE_REDIS_ENABLED=true",
		"CACHE_REDIS_URI=redis://evolution-redis:6379",
		"CACHE_REDIS_PREFIX_KEY=evolution",
		"CACHE_REDIS_SAVE_INSTANCES=true",
	];

	return {
		domains,
		envs,
	};
}
