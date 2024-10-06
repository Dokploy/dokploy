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
			port: 5678,
			serviceName: "n8n",
		},
	];
	const envs = [
		`N8N_HOST=${mainDomain}`,
		"N8N_PORT=5678",
		"GENERIC_TIMEZONE=Europe/Berlin",
	];

	return {
		envs,
		domains,
	};
}
