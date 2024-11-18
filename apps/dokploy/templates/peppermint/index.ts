import {
	type DomainSchema,
	type Schema,
	type Template,
	generateBase64,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	// Generate domains and secrets
	const mainDomain = generateRandomDomain(schema);
	const apiDomain = generateRandomDomain(schema);
	const postgresPassword = generatePassword();
	const secret = generateBase64(32);

	// Configure domain routing
	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 3000,
			serviceName: "peppermint",
		},
		{
			host: apiDomain,
			port: 5003,
			serviceName: "peppermint",
		},
	];

	// Set environment variables
	const envs = [
		`MAIN_DOMAIN=${mainDomain}`,
		`API_DOMAIN=${apiDomain}`,
		`POSTGRES_PASSWORD=${postgresPassword}`,
		`SECRET=${secret}`,
	];

	return {
		domains,
		envs,
	};
}
