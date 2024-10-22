import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
	generateBase64,
	generatePassword,
} from "../utils";

export function generate(schema: Schema): Template {
	const directusSecret = generateBase64(64);
	const databasePassword = generatePassword();

	const domains: DomainSchema[] = [
		{
			host: generateRandomDomain(schema),
			port: 8055,
			serviceName: "directus",
		},
	];

	const envs = [
		`DATABASE_PASSWORD=${databasePassword}`,
		`DIRECTUS_SECRET=${directusSecret}`,
	];

	return {
		domains,
		envs,
	};
}
