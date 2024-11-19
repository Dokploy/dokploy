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
	const secretKeyBase = generateBase64(64);
	const postgresPassword = generatePassword();

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "chatwoot-rails",
		},
	];

	const envs = [
		`FRONTEND_URL=http://${mainDomain}`,
		`SECRET_KEY_BASE=${secretKeyBase}`,
		"RAILS_ENV=production",
		"NODE_ENV=production",
		"INSTALLATION_ENV=docker",
		"RAILS_LOG_TO_STDOUT=true",
		"LOG_LEVEL=info",
		"DEFAULT_LOCALE=en",
		"POSTGRES_HOST=chatwoot-postgres",
		"POSTGRES_PORT=5432",
		"POSTGRES_DATABASE=chatwoot",
		"POSTGRES_USERNAME=postgres",
		`POSTGRES_PASSWORD=${postgresPassword}`,
		"REDIS_URL=redis://chatwoot-redis:6379",
		"ENABLE_ACCOUNT_SIGNUP=false",
		"ACTIVE_STORAGE_SERVICE=local",
	];

	return {
		domains,
		envs,
	};
}
