import {
	type DomainSchema,
	type Schema,
	type Template,
	generatePassword,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const defaultDomain = generateRandomDomain(schema);
	const initialApiKey = generatePassword(30);

	const domains: DomainSchema[] = [
		{
			host: `web-${defaultDomain}`,
			port: 8080,
			serviceName: "shlink-web",
		},
		{
			host: defaultDomain,
			port: 8080,
			serviceName: "shlink",
		},
	];

	const envs = [
		`INITIAL_API_KEY=${initialApiKey}`,
		`DEFAULT_DOMAIN=${defaultDomain}`,
	];

	return {
		envs,
		domains,
	};
}
