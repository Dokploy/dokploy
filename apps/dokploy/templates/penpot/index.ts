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

	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 80,
			serviceName: "penpot-frontend",
		},
	];

	const envs = [`DOMAIN_NAME=${mainDomain}`];

	return {
		domains,
		envs,
	};
}
